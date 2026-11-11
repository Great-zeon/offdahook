// ========================================================================
// OFF DA HOOK SALON SUITES - HARDENED STRIPE CHECKOUT API (VERCEL SERVERLESS)
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

// Helper: Authoritative local catalog lookup if Supabase connection is pending
function getLocalCatalogProduct(id) {
  try {
    const filePath = path.join(process.cwd(), 'assets', 'shop', 'products.json');
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const found = items.find(p => p.id === id);
      if (found) {
        return {
          id: found.id,
          title: found.title,
          price: parseFloat((found.price || '0').replace(/[^0-9.]/g, '')),
          stock: found.stock || 10,
          image: found.mainImage || found.image
        };
      }
    }
  } catch (e) {
    console.error('Error reading local catalog fallback:', e);
  }
  return null;
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
      return res.status(400).json({ success: false, error: 'Your crown bag is empty. Please select formulas before checking out.' });
    }

    // 1. Production Gateway Verification
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Online payment processing is temporarily undergoing maintenance. Please call Off Da Hook Salon Suites directly at (347) 238-1602 to complete your order.'
      });
    }

    // 2. Authoritative Server-Side Product & Inventory Verification
    // CRITICAL: We NEVER trust the client-submitted price. Prices and stock are fetched strictly from the database.
    const verifiedLineItems = [];
    const sanitizedCartMetadata = [];

    for (const item of items) {
      const productId = item.id;
      const quantity = parseInt(item.quantity, 10);

      if (!productId || isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cart contents. Please clear your bag and re-add your formulas.'
        });
      }

      let authoritativeProduct = null;

      if (supabase) {
        const { data: dbProd, error } = await supabase
          .from('products')
          .select('id, title, price, stock, image, is_active')
          .eq('id', productId)
          .single();

        if (!error && dbProd) {
          authoritativeProduct = dbProd;
        }
      }

      // Fallback lookup if Supabase is offline but file exists
      if (!authoritativeProduct) {
        authoritativeProduct = getLocalCatalogProduct(productId);
      }

      if (!authoritativeProduct || authoritativeProduct.is_active === false) {
        return res.status(400).json({
          success: false,
          error: `Formula "${item.title || productId}" is no longer available in our salon apothecary.`
        });
      }

      // Concurrency check against available inventory
      if (authoritativeProduct.stock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Apologies! "${authoritativeProduct.title}" only has ${authoritativeProduct.stock} unit(s) remaining in stock.`
        });
      }

      const authoritativePrice = parseFloat(authoritativeProduct.price);
      const unitAmountInCents = Math.round(authoritativePrice * 100);

      const origin = req.headers.origin || 'https://offdahook.vercel.app';
      const imageUrl = authoritativeProduct.image && authoritativeProduct.image.startsWith('http')
        ? authoritativeProduct.image
        : `${origin}/${(authoritativeProduct.image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg').replace(/^\//, '')}`;

      verifiedLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: authoritativeProduct.title,
            description: item.variant ? `Variant: ${item.variant}` : 'Off Da Hook Signature Formula',
            images: [imageUrl],
            metadata: {
              productId: authoritativeProduct.id,
              variant: item.variant || ''
            }
          },
          unit_amount: unitAmountInCents
        },
        quantity: quantity
      });

      sanitizedCartMetadata.push({
        id: authoritativeProduct.id,
        title: authoritativeProduct.title,
        qty: quantity,
        price: authoritativePrice
      });
    }

    // 3. Create Stripe Checkout Session with US Shipping & Tax Enforcement
    // PAYMENT METHOD ARCHITECTURE: Restricted explicitly to 'card' (credit/debit).
    // Card payments settle synchronously, preventing orphaned checkouts and uncollected funds.
    // Asynchronous payment events are also handled defensively in api/webhook.js.
    const origin = req.headers.origin || 'https://offdahook.vercel.app';
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: verifiedLineItems,
      mode: 'payment',
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      phone_number_collection: {
        enabled: true
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 695, currency: 'usd' },
            display_name: 'Standard Priority Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 5 }
            }
          }
        }
      ],
      success_url: `${origin}/shop.html?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop.html?order=cancelled`,
      metadata: {
        itemCount: verifiedLineItems.length,
        itemsJson: JSON.stringify(sanitizedCartMetadata)
      }
    };

    if (customerEmail && customerEmail.includes('@')) {
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
    return res.status(500).json({
      success: false,
      error: 'Unable to initialize checkout. Please contact the salon at (347) 238-1602.'
    });
  }
};
