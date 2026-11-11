// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE SESSION VERIFICATION & SELF-HEALING RECONCILIATION API
// Verifies genuine payment completion and heals missing orders if webhook delayed
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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
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

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing session_id parameter' });
  }

  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Payment service unavailable' });
  }

  try {
    // 1. Retrieve authoritative session directly from Stripe API
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
    const customerPhone = session.customer_details?.phone || '';
    const shipping = session.shipping_details?.address || session.customer_details?.address || {};
    const formattedAddress = shipping.line1
      ? `${shipping.line1}${shipping.line2 ? ', ' + shipping.line2 : ''}, ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`
      : 'Address on file';
    const totalAmount = (session.amount_total || 0) / 100;
    const subtotalAmount = (session.amount_subtotal || session.amount_total || 0) / 100;

    let items = [];
    if (session.metadata?.itemsJson) {
      try {
        items = JSON.parse(session.metadata.itemsJson);
      } catch (e) {}
    }

    // 2. Fetch corresponding order record from Supabase
    let orderRecord = null;
    if (supabase) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('stripe_session_id', sessionId)
        .maybeSingle();

      if (data) {
        orderRecord = data;
      } else {
        // 3. Self-Healing Lazy Reconciliation:
        // Webhook was delayed or timed out. Reconcile and persist the order right now!
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const newOrderId = `ODH-${datePrefix}-${randomSuffix}`;

        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('process_paid_order_atomic', {
            p_order: {
              id: newOrderId,
              stripe_session_id: session.id,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
              shipping_address: shipping,
              subtotal: subtotalAmount,
              total_amount: totalAmount,
              payment_method: 'Stripe'
            },
            p_items: items,
            p_event_id: `reconciled-${session.id}`
          });

          if (!rpcError && rpcData?.success) {
            orderRecord = { id: newOrderId };
            console.log(`Self-healing reconciliation successfully created order ${newOrderId} for session ${sessionId}`);
          } else if (rpcData?.duplicate) {
            // Webhook arrived concurrently while verify-session was executing!
            // Re-fetch the authoritative order from Supabase
            console.log(`Concurrent order detected for session ${sessionId}. Retrieving authoritative order.`);
            const { data: dupOrder } = await supabase
              .from('orders')
              .select('*')
              .eq('stripe_session_id', sessionId)
              .maybeSingle();
            if (dupOrder) {
              orderRecord = dupOrder;
            }
          }
        } catch (e) {
          console.warn('Reconciliation fallback execution:', e);
        }

        // Secondary fallback insert only if RPC not present AND no duplicate was detected
        if (!orderRecord) {
          try {
            // Check once more to prevent duplicate key constraint violation
            const { data: existingCheck } = await supabase
              .from('orders')
              .select('*')
              .eq('stripe_session_id', session.id)
              .maybeSingle();

            if (existingCheck) {
              orderRecord = existingCheck;
            } else {
              const { data: inserted } = await supabase.from('orders').insert([{
                id: newOrderId,
                stripe_session_id: session.id,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                shipping_address: shipping,
                items: items,
                subtotal: subtotalAmount,
                total_amount: totalAmount,
                payment_status: 'Paid',
                payment_method: 'Stripe',
                fulfillment_status: 'Pending',
                created_at: new Date().toISOString()
              }]).select();

              if (inserted && inserted[0]) {
                orderRecord = inserted[0];
              }
            }
          } catch (insertEx) {
            console.error('Failed reconciliation insert:', insertEx);
          }
        }
      }
    }

    const effectiveId = orderRecord ? orderRecord.id : `ODH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${sessionId.slice(-4).toUpperCase()}`;

    return res.status(200).json({
      success: true,
      verified: true,
      order: {
        id: effectiveId,
        customerName: customerName,
        customerEmail: customerEmail,
        totalAmount: totalAmount,
        shippingAddress: formattedAddress,
        items: items
      }
    });
  } catch (err) {
    console.error('Session Verification Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify checkout session' });
  }
};
