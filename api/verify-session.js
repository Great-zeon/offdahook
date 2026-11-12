// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE SESSION VERIFICATION & RECONCILIATION API
// Verifies genuine Stripe payment completion and reconciles missing orders
// Second-Round Remediation Corrections:
//   1. Shared Payment Validation: Enforces identical currency, bounds, and item checks as webhook.
//   2. Zero Synthetic Order IDs: Truthfully returns order_persisted: false when DB order is pending.
//   3. Customer Privacy Minimization: Session reference masked to last 8 chars (session_ref); email masked.
//   4. Collision-Resistant Reconciliation Order IDs: Uses crypto.randomBytes(4) hex suffix.
//   5. Origin-Constrained CORS: Replaces wildcard with verified storefront origins.
//   6. Strict No-Store Cache Headers: Prevents edge/browser caching of verification state.
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { applySecureCors, validateStripeSession, maskEmail } = require('./_payment-validation');
const { enrichOrderNotifications, dispatchOrderNotifications } = require('./_notification-outbox');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async (req, res) => {
  // 1. Origin-Constrained CORS Configuration
  applySecureCors(req, res, 'GET, OPTIONS', 'Content-Type');

  // 2. Strict Anti-Caching Headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const sessionId = req.query.session_id;

  // 3. Strict Session ID Format Validation
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing session_id parameter' });
  }

  const sessionRegex = /^cs_(test|live)_[a-zA-Z0-9]+$/;
  if (!sessionRegex.test(sessionId)) {
    return res.status(400).json({ success: false, error: 'Invalid Stripe session ID format' });
  }

  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Payment gateway configuration unavailable' });
  }

  try {
    // 4. Authoritative Retrieval Directly from Stripe API
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Checkout session not found' });
    }

    // 5. Authoritative Checkout Intent & Shared Strict Payment Validation
    let authoritativeIntent = null;
    if (session.metadata?.checkout_intent_id && supabase) {
      const { data: intent, error: intentErr } = await supabase
        .from('checkout_intents')
        .select('*')
        .eq('id', session.metadata.checkout_intent_id)
        .maybeSingle();

      if (intentErr) {
        console.error('Database error retrieving checkout_intent in verify-session:', intentErr.message);
        return res.status(503).json({
          success: false,
          verified: false,
          error: 'Temporary system verification delay. Please refresh in a moment.'
        });
      }

      if (intent) {
        authoritativeIntent = intent;
      }
    }

    let validatedSession;
    try {
      validatedSession = validateStripeSession(session, { intent: authoritativeIntent });
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: valErr.message,
        code: valErr.code
      });
    }

    const customerName = session.customer_details?.name || 'Valued Crown Client';
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const totalAmount = validatedSession.amountTotalDollars;
    const subtotalAmount = (session.amount_subtotal || session.amount_total || 0) / 100;
    const items = validatedSession.items;

    // 6. Query Authoritative Order Record in Supabase
    let orderRecord = null;

    if (supabase) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, fulfillment_status, created_at, items')
        .eq('stripe_session_id', sessionId)
        .maybeSingle();

      if (existingOrder) {
        orderRecord = existingOrder;
      } else {
        // 7. Self-Healing Atomic Reconciliation
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const secureSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
        const newOrderId = `ODH-${datePrefix}-${secureSuffix}`;
        const shipping = session.shipping_details?.address || session.customer_details?.address || {};
        const phone = session.customer_details?.phone || '';

        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('process_paid_order_atomic', {
            p_order: {
              id: newOrderId,
              stripe_session_id: session.id,
              checkout_intent_id: session.metadata?.checkout_intent_id || null,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: phone,
              shipping_address: shipping,
              subtotal: subtotalAmount,
              total_amount: totalAmount,
              payment_method: 'Stripe',
              event_type: 'reconciliation.verify_session'
            },
            p_items: items,
            p_event_id: `reconciled-${session.id}`
          });

          if (!rpcError && rpcData?.success) {
            const resolvedId = rpcData.order_id || newOrderId;
            orderRecord = {
              id: resolvedId,
              fulfillment_status: 'Pending',
              items: items
            };
            await enrichOrderNotifications(supabase, {
              orderId: resolvedId,
              customerName,
              customerEmail,
              customerPhone: phone,
              shippingAddress: shipping,
              items,
              totalAmount,
              isShortfall: false
            });
            dispatchOrderNotifications(supabase, resolvedId).catch(() => {});
          } else if (rpcData?.duplicate) {
            const { data: dupOrder } = await supabase
              .from('orders')
              .select('id, fulfillment_status, created_at, items')
              .eq('stripe_session_id', sessionId)
              .maybeSingle();
            if (dupOrder) {
              orderRecord = dupOrder;
            }
          } else if (rpcData?.action_required) {
            const resolvedId = rpcData.order_id || newOrderId;
            orderRecord = {
              id: resolvedId,
              fulfillment_status: 'Backordered_Action_Required',
              items: items
            };
            await enrichOrderNotifications(supabase, {
              orderId: resolvedId,
              customerName,
              customerEmail,
              customerPhone: phone,
              shippingAddress: shipping,
              items,
              totalAmount,
              isShortfall: true,
              shortfallDetails: rpcData.shortfall_details
            });
            dispatchOrderNotifications(supabase, resolvedId).catch(() => {});
          }
        } catch (rpcEx) {
          console.warn('Reconciliation RPC execution failed:', rpcEx.message);
        }
      }
    }

    // 8. Truthful Response Enforcement (Zero Synthetic Order IDs)
    if (orderRecord && orderRecord.id) {
      const displayItems = (Array.isArray(orderRecord.items) ? orderRecord.items : items).map(i => ({
        title: i.title || 'Crown Formula',
        qty: i.qty || i.quantity || 1,
        price: Number(i.price || 0)
      }));

      return res.status(200).json({
        success: true,
        verified: true,
        order_persisted: true,
        order: {
          id: orderRecord.id,
          customerName: customerName,
          maskedEmail: maskEmail(customerEmail),
          totalAmount: totalAmount,
          itemCount: displayItems.length,
          items: displayItems,
          fulfillmentStatus: orderRecord.fulfillment_status || 'Pending'
        }
      });
    }

    // If payment is verified by Stripe but database persistence is pending:
    // NEVER INVENT A SYNTHETIC ORDER ID.
    // Expose only masked session reference suffix for customer privacy.
    return res.status(200).json({
      success: true,
      verified: true,
      order_persisted: false,
      status: 'payment_verified_order_pending',
      session_ref: sessionId.slice(-8),
      amount_total: totalAmount,
      message: `Your payment of $${totalAmount.toFixed(2)} USD has been verified by Stripe. Your order is finalizing in our salon system. Please allow a few moments or save your reference (${sessionId.slice(-8)}) if you contact the salon at (347) 238-1602.`
    });

  } catch (err) {
    console.error('Session Verification API Error:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to verify checkout session at this time. Please contact Off Da Hook Salon Suites directly at (347) 238-1602.'
    });
  }
};
