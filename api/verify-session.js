// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE SESSION VERIFICATION API
// Verifies genuine payment completion before confirming order on storefront
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

    // 2. Fetch corresponding order record from Supabase if available
    let orderRecord = null;
    if (supabase) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('stripe_session_id', sessionId)
        .maybeSingle();

      if (data) {
        orderRecord = data;
      }
    }

    let items = [];
    if (session.metadata?.itemsJson) {
      try {
        items = JSON.parse(session.metadata.itemsJson);
      } catch (e) {}
    }

    const shipping = session.shipping_details?.address || session.customer_details?.address || {};
    const formattedAddress = shipping.line1
      ? `${shipping.line1}${shipping.line2 ? ', ' + shipping.line2 : ''}, ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postal_code || ''}`
      : 'Address on file';

    return res.status(200).json({
      success: true,
      verified: true,
      order: {
        id: orderRecord ? orderRecord.id : `ODH-REC-${sessionId.slice(-6).toUpperCase()}`,
        customerName: session.customer_details?.name || 'Valued Crown Client',
        customerEmail: session.customer_details?.email || '',
        totalAmount: (session.amount_total || 0) / 100,
        shippingAddress: formattedAddress,
        items: items
      }
    });
  } catch (err) {
    console.error('Session Verification Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify checkout session' });
  }
};

