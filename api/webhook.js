// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE WEBHOOK HANDLER (VERCEL SERVERLESS)
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

// In Vercel, disable body parsing to read raw buffer for Stripe signature check
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const customerName = session.customer_details?.name || 'Customer';
      const customerEmail = session.customer_details?.email || session.customer_email || '';
      const customerPhone = session.customer_details?.phone || '';
      const shippingAddress = session.shipping_details?.address || session.customer_details?.address || {};
      const totalAmount = (session.amount_total || 0) / 100;
      const orderId = `ODH-${Date.now().toString().slice(-4)}`;

      let items = [];
      if (session.metadata?.itemsJson) {
        try {
          items = JSON.parse(session.metadata.itemsJson);
        } catch (e) {}
      }

      // If Supabase is connected, record order & deduct stock
      if (supabase) {
        // 1. Insert order record
        await supabase.from('orders').insert([{
          id: orderId,
          stripe_session_id: session.id,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          shipping_address: shippingAddress,
          items: items,
          subtotal: totalAmount,
          total_amount: totalAmount,
          payment_status: 'Paid',
          payment_method: 'Stripe',
          fulfillment_status: 'Pending'
        }]);

        // 2. Deduct inventory stock for purchased items
        for (const item of items) {
          if (item.id) {
            const { data: prod } = await supabase
              .from('products')
              .select('stock')
              .eq('id', item.id)
              .single();

            if (prod) {
              const newStock = Math.max(0, prod.stock - (parseInt(item.qty, 10) || 1));
              await supabase
                .from('products')
                .update({ stock: newStock, updated_at: new Date().toISOString() })
                .eq('id', item.id);
            }
          }
        }
      }

      console.log(`Order ${orderId} successfully logged for ${customerEmail} ($${totalAmount})`);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Error processing order in webhook:', err);
      return res.status(500).json({ error: 'Failed to process order' });
    }
  }

  return res.status(200).json({ received: true });
};

