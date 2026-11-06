// ========================================================================
// OFF DA HOOK SALON SUITES - STRIPE CHECKOUT API (VERCEL SERVERLESS)
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { items, customerEmail, customerName } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    // 1. Stock validation against Supabase if database is connected
    if (supabase) {
      for (const item of items) {
        if (item.id) {
          const { data: prod } = await supabase
            .from('products')
            .select('stock, title')
            .eq('id', item.id)
            .single();

          if (prod && prod.stock < item.quantity) {
            return res.status(400).json({
              success: false,
              error: `Sorry! "${prod.title}" only has ${prod.stock} unit(s) remaining in stock.`
            });
          }
        }
      }
    }

    // 2. Fallback / Test Mode if STRIPE_SECRET_KEY is not yet supplied
    if (!stripe) {
      return res.status(200).json({
        success: true,
        mode: 'demo',
        message: 'Stripe API keys are not yet configured on this environment. Order recorded in local admin storage.',
        demoOrder: {
          id: `ODH-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().replace('T', ' ').substring(0, 16),
          items,
          customerName: customerName || 'Valued Crown Client',
          customerEmail: customerEmail || 'guest@example.com',
          totalAmount: items.reduce((acc, i) => acc + (parseFloat(i.price) * (parseInt(i.quantity, 10) || 1)), 0)
        }
      });
    }

    // 3. Build Stripe line items
    const origin = req.headers.origin || 'https://www.offdahookhairsalon.com';
    const line_items = items.map(item => {
      const unitAmountInCents = Math.round(parseFloat(item.price) * 100);
      const imageUrl = item.image && item.image.startsWith('http')
        ? item.image
        : `${origin}/${(item.image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg').replace(/^\//, '')}`;

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            description: item.variant ? `Variant: ${item.variant}` : 'Off Da Hook Signature Formula',
            images: [imageUrl],
            metadata: {
              productId: item.id || '',
              variant: item.variant || ''
            }
          },
          unit_amount: unitAmountInCents
        },
        quantity: parseInt(item.quantity, 10) || 1
      };
    });

    // 4. Create Stripe Checkout Session
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      phone_number_collection: {
        enabled: true
      },
      success_url: `${origin}/shop.html?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop.html?order=cancelled`,
      metadata: {
        itemCount: items.length,
        itemsJson: JSON.stringify(items.map(i => ({ id: i.id, title: i.title, qty: i.quantity, price: i.price })))
      }
    };

    if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (err) {
    console.error('Checkout API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

