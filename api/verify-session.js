// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE SESSION VERIFICATION & RECONCILIATION API
// Verifies genuine Stripe payment completion and reconciles missing orders
// Defect Corrections:
//   1. ZERO SYNTHETIC ORDER IDs: Never manufactures fake ODH-... IDs when DB persistence is incomplete.
//   2. Distinct 'order_persisted: false' pending state when payment is confirmed but DB order is pending.
//   3. Customer privacy protection: Masks email, omits full phone/address, enforces no-store cache headers.
//   4. Strict session ID format validation (^cs_(test|live)_[a-zA-Z0-9]+$).
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

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

// Helper: Mask email address for customer confirmation privacy
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'Customer on file';
  }
  const [user, domain] = email.split('@');
  if (user.length <= 2) {
    return `${user[0]}***@${domain}`;
  }
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

module.exports = async (req, res) => {
  // Security & Strict Cache Control Headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const sessionId = req.query.session_id;

  // 1. Strict Session ID Format Validation
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
    // 2. Authoritative Retrieval Directly from Stripe API
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Checkout session not found' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Payment has not been completed or was declined.'
      });
    }

    const customerName = session.customer_details?.name || 'Valued Crown Client';
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const totalAmount = (session.amount_total || 0) / 100;
    const subtotalAmount = (session.amount_subtotal || session.amount_total || 0) / 100;

    let items = [];
    if (session.metadata?.itemsJson) {
      try {
        items = JSON.parse(session.metadata.itemsJson);
      } catch (e) {
        console.error('Failed to parse metadata itemsJson in verify-session:', e);
      }
    }

    // 3. Query Authoritative Order Record in Supabase
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
        // 4. Self-Healing Atomic Reconciliation
        // Webhook was delayed by network or queue. Attempt atomic reconciliation.
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const newOrderId = `ODH-${datePrefix}-${randomSuffix}`;
        const shipping = session.shipping_details?.address || session.customer_details?.address || {};

        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('process_paid_order_atomic', {
            p_order: {
              id: newOrderId,
              stripe_session_id: session.id,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: session.customer_details?.phone || '',
              shipping_address: shipping,
              subtotal: subtotalAmount,
              total_amount: totalAmount,
              payment_method: 'Stripe'
            },
            p_items: items,
            p_event_id: `reconciled-${session.id}`
          });

          if (!rpcError && rpcData?.success) {
            orderRecord = {
              id: rpcData.order_id || newOrderId,
              fulfillment_status: 'Pending'
            };
            console.log(`Self-healing reconciliation successfully created order ${orderRecord.id} for session ${sessionId}`);
          } else if (rpcData?.duplicate) {
            // Webhook arrived concurrently while verify-session was executing
            console.log(`Concurrent order detected for session ${sessionId}. Retrieving authoritative order.`);
            const { data: dupOrder } = await supabase
              .from('orders')
              .select('id, fulfillment_status, created_at, items')
              .eq('stripe_session_id', sessionId)
              .maybeSingle();
            if (dupOrder) {
              orderRecord = dupOrder;
            }
          } else if (rpcData?.action_required) {
            // Order saved as Backordered_Action_Required due to stock shortfall
            orderRecord = {
              id: rpcData.order_id || newOrderId,
              fulfillment_status: 'Backordered_Action_Required'
            };
          }
        } catch (rpcEx) {
          console.warn('Reconciliation RPC execution failed:', rpcEx.message);
        }
      }
    }

    // 5. Truthful Response Enforcement (Zero Synthetic Order IDs)
    // If order was successfully found or persisted:
    if (orderRecord && orderRecord.id) {
      return res.status(200).json({
        success: true,
        verified: true,
        order_persisted: true,
        order: {
          id: orderRecord.id,
          customerName: customerName,
          maskedEmail: maskEmail(customerEmail),
          totalAmount: totalAmount,
          itemCount: Array.isArray(items) ? items.length : 1,
          fulfillmentStatus: orderRecord.fulfillment_status || 'Pending'
        }
      });
    }

    // If payment is verified by Stripe but database persistence is pending:
    // NEVER INVENT A SYNTHETIC ORDER ID.
    // Return honest payment-verified pending-reconciliation status.
    return res.status(200).json({
      success: true,
      verified: true,
      order_persisted: false,
      status: 'payment_verified_order_pending',
      session_id: sessionId,
      amount_total: totalAmount,
      message: `Your payment of $${totalAmount.toFixed(2)} USD has been verified by Stripe. Your order is finalizing in our salon system. Please allow a few moments or save your Stripe Session Reference (${sessionId.slice(-8)}) if you contact the salon at (347) 238-1602.`
    });

  } catch (err) {
    console.error('Session Verification API Error:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to verify checkout session at this time. Please contact Off Da Hook Salon Suites directly at (347) 238-1602.'
    });
  }
};
