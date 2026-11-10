# OFF DA HOOK — PRODUCTION READINESS TECHNICAL AUDIT
**Project:** Off Da Hook Salon Suites E-Commerce System  
**Audit Date:** November 10, 2026  
**Auditor:** Senior Full-Stack, Database & Application Security Architecture Review  
**Repository Branch:** `main`  
**Deployment Target:** Vercel (`https://offdahook.vercel.app`) + Supabase PostgreSQL (`xtdoqeoaflhvdduygndr`)

---

## 1. EXECUTIVE SUMMARY & VERIFIED STATUS TABLE

Following an exhaustive code-level and architecture inspection across all frontend scripts, Vercel serverless functions, database schemas, and integration points, **the e-commerce system in its current state is NOT production-ready.**

While visual storefront components and the slide-over cart drawer render smoothly, the underlying transaction pipeline possesses **critical security vulnerabilities, financial risks, missing integrations, and unhandled race conditions** that must be resolved before processing live transactions with real money.

### Component Verification Audit Matrix

| Component | Current Implementation | Verified Status | Key Findings & Missing Requirements |
| :--- | :--- | :--- | :--- |
| **Product Catalog** | Hybrid: reads from Supabase `products` table via `GET /api/products`, falls back to local `products.json`. | **FAIL** | If Supabase is unavailable, it fails over to static JSON rather than presenting a truthful database connection error. Category filters work visually. |
| **Shopping Cart** | `main.js` localStorage cart with slide-over drawer, steppers, and badge counts. | **FAIL** | Subtotals and prices are calculated client-side and submitted directly to the checkout API without server verification. |
| **Inventory Concurrency** | Non-atomic check in `api/checkout.js`; stock deducted via loop in `api/webhook.js`. | **FAIL** | **Zero concurrency protection.** No atomic reservation. Simultaneous checkouts for the last item will oversell. No database row locking or `CHECK (stock >= 0)` constraint. |
| **Checkout Validation** | `POST /api/checkout` validates non-empty cart, but accepts client-submitted prices and quantities. | **FAIL** | **Critical Financial Vulnerability:** Server accepts `item.price` directly from the request body. A malicious client can modify prices to $0.01. No shipping rates configured in Stripe session. |
| **Stripe Integration** | `api/checkout.js` creates Stripe Checkout Session if `STRIPE_SECRET_KEY` exists; restricted to `'card'`. | **FAIL** | Session created, but return URL `order=success&session_id=...` is never processed by `shop.html` or `main.js`. Cart is not cleared upon return. Payment confirmation is unverified on frontend. |
| **PayPal Integration** | Referenced in marketing copy, dashboard labels, and fake seed orders. | **FAIL (PLACEHOLDER)** | **100% Non-Existent.** No PayPal SDK, no PayPal REST API client, no PayPal webhook handler, no PayPal environment variables. |
| **Webhooks** | `api/webhook.js` handles `checkout.session.completed`. | **FAIL** | 1) In Vercel, `req.body` is parsed as JSON, breaking `constructEvent()` raw buffer signature verification. 2) Fallback to unverified `req.body` when secret is missing. 3) **No idempotency:** duplicate events deduct stock multiple times. 4) Order ID collision risk (`Date.now().slice(-4)`). |
| **Email Notifications** | Report claimed Stripe/PayPal automated receipts. | **FAIL (PLACEHOLDER)** | No email delivery service (Resend, SendGrid, Postmark, SES) configured in `package.json` or `api/`. No merchant order notifications sent to Shawnese. No shipping confirmation emails. |
| **Orders Storage** | Supabase `orders` table with JSONB items and shipping address. | **FAIL** | Uses 4-digit random Order IDs (`ODH-XXXX`) prone to collisions. No line-item audit trail. Does not record shipping courier or tracking numbers. |
| **Admin Authentication** | PIN check in `admin.html` against `localStorage` or `offdahook2026`. Passed as `x-admin-pin` header or URL query string. | **FAIL** | **Critical Security Vulnerability:** Client-side gate only (`sessionStorage`). Plaintext PIN transmitted in URL. No session tokens, no password hashing, no HttpOnly cookies, no rate limiting. Public disclosure of default PIN. |
| **Admin Dashboard** | `admin.html` single-page dashboard with inventory and orders tables. | **FAIL** | **Fabricates fake orders** (`SEED_ORDERS`) in localStorage when empty, directly misrepresenting business revenue and order history. |
| **Database Security (RLS)** | `schema.sql` defines tables but lacks Row Level Security policies. | **FAIL** | RLS is not enabled. If Supabase public anon key is exposed, any anonymous actor can query, read, or delete all orders and customer personal data. |
| **Demo Mode Fallback** | `main.js` modal confirms order and marks it "Paid (Stripe / PayPal)" when API fails. | **FAIL** | **Critical Business Defect:** Customers are shown a fake "Order Confirmed" screen with $0 charged if Stripe is not reachable, falsely claiming payment succeeded. |

---

## 2. DETAILED VULNERABILITY & DEFECT ANALYSIS

### Defect 1: Client-Controlled Pricing in `api/checkout.js` (CRITICAL FINANCIAL EXPLOIT)
* **Location:** [`api/checkout.js:82-104`](file:///Users/macos/Downloads/offdahook/api/checkout.js#L82-L104)
* **Root Cause:** The line items passed to Stripe are constructed by taking `item.price` directly from the client's HTTP request body:
  ```javascript
  const unitAmountInCents = Math.round(parseFloat(item.price) * 100);
  ```
* **Impact:** Anyone using curl, Postman, or browser DevTools can submit an order for the $100 Fully Loaded Regrowth System with `price: "0.50"`, pay 50 cents on Stripe, and trigger a legitimate paid order.
* **Remediation:** `api/checkout.js` must fetch the authoritative price directly from the Supabase `products` table using `item.id`. Any client-submitted price must be completely ignored.

---

### Defect 2: Fake Client Confirmation Modal on Gateway Failure (CRITICAL OPERATIONAL DEFECT)
* **Location:** [`main.js:3218-3343`](file:///Users/macos/Downloads/offdahook/main.js#L3218-L3343)
* **Root Cause:** When `/api/checkout` fails or returns demo mode, `main.js` opens a client-side modal `showCheckoutModal(cart)`. Upon submission, it executes:
  ```javascript
  const newOrder = {
    paymentStatus: 'Paid (Stripe / PayPal)',
    ...
  };
  orders.unshift(newOrder);
  localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
  showOrderConfirmation(newOrder);
  ```
* **Impact:** The customer is presented with an authentic-looking green checkmark, told *"Crown Order Confirmed! Payment Method: Stripe / PayPal Protected"*, their cart is cleared, and an order marked "Paid" is logged locally—even though **zero payment was collected**.
* **Remediation:** Remove client-side order creation entirely. If `/api/checkout` fails, display a clear error message explaining that the payment gateway is unavailable. Never display a confirmation or mark an order as paid without server-verified payment.

---

### Defect 3: Webhook Raw Body Handling in Vercel Serverless (CRITICAL WEBHOOK FAILURE)
* **Location:** [`api/webhook.js:28-42`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L28-L42)
* **Root Cause:** Vercel automatically parses incoming request bodies as JSON objects unless disabled via function configuration. Stripe's `stripe.webhooks.constructEvent(rawBody, sig, secret)` requires the **raw, unparsed Buffer**. Because `api/webhook.js` does not export:
  ```javascript
  export const config = { api: { bodyParser: false } };
  ```
  `stripe.webhooks.constructEvent` will fail on Vercel with a signature verification exception. Furthermore, lines 36-38 fall back to unverified `event = req.body` if the secret is not supplied, permitting forged webhook calls.
* **Remediation:** Implement raw buffer collection for Vercel functions, strictly enforce signature verification, and reject requests without valid signatures with HTTP 400.

---

### Defect 4: Missing Webhook Idempotency (DOUBLE STOCK DEDUCTION)
* **Location:** [`api/webhook.js:81-98`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L81-L98)
* **Root Cause:** Stripe retries webhook deliveries if the server responds slowly or with a 5xx error. In `api/webhook.js`, there is no check whether `session.id` has already been processed before deducting stock.
* **Impact:** If Stripe delivers the `checkout.session.completed` event twice, the product stock will be decremented **twice** for a single customer purchase.
* **Remediation:** Maintain a `payment_events` table or check `orders.stripe_session_id`. If an order with that `stripe_session_id` already exists, return `HTTP 200 { received: true, already_processed: true }` immediately without modifying inventory.

---

### Defect 5: No Atomic Stock Reservation or Concurrency Protection (OVERSELLING)
* **Location:** [`api/checkout.js:44-61`](file:///Users/macos/Downloads/offdahook/api/checkout.js#L44-L61) & [`api/webhook.js:81-98`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L81-L98)
* **Root Cause:** Inventory is checked when the checkout session is created, but **not reserved**. Stock is only deducted minutes later when the webhook fires after payment.
* **Impact:** If two customers attempt to buy the last available bottle at 2:00 PM, both pass the stock check (`stock == 1 >= 1`). Both pay Stripe. Both webhooks execute. Customer 1 reduces stock to 0. Customer 2 reduces stock to 0 (via `Math.max(0, ...)`). Both customers have paid, but only one bottle exists.
* **Remediation:** Implement a PostgreSQL database function `deduct_product_stock_atomic` with a conditional update (`UPDATE products SET stock = stock - qty WHERE id = id AND stock >= qty`). For checkout sessions, implement an atomic stock reservation with a 15-minute expiration time.

---

### Defect 6: Insecure Admin Authentication (DATA EXPOSURE)
* **Location:** [`admin.html:1158-1183`](file:///Users/macos/Downloads/offdahook/admin.html#L1158-L1183) & [`api/orders.js:25-30`](file:///Users/macos/Downloads/offdahook/api/orders.js#L25-L30)
* **Root Cause:**
  1. The dashboard PIN check is performed in browser JavaScript:
     ```javascript
     if (pinInput.value === storedPin) {
       sessionStorage.setItem('odh_admin_auth', 'true');
     }
     ```
     Any visitor can execute `sessionStorage.setItem('odh_admin_auth', 'true')` in DevTools to unhide the admin UI.
  2. `GET /api/orders` accepts the PIN via a query parameter: `?pin=...`. This exposes the PIN in browser history, proxy logs, and referrers.
  3. No rate limiting exists. A 4-digit or standard word PIN can be brute-forced within seconds.
  4. The default PIN `offdahook2026` is stored in source code.
* **Remediation:** Implement server-side session authentication using secure HttpOnly cookies, password hashing (bcrypt), and rate limiting on the login endpoint.

---

### Defect 7: Missing Database Row Level Security (RLS)
* **Location:** [`schema.sql:8-38`](file:///Users/macos/Downloads/offdahook/schema.sql#L8-L38)
* **Root Cause:** Neither `products` nor `orders` has `ROW LEVEL SECURITY` enabled.
* **Impact:** If Supabase's anon publishable key is present in frontend code or Git history, any anonymous user can issue direct PostgREST calls to read customer phone numbers, home addresses, and order histories, or modify product pricing.
* **Remediation:** Execute `ALTER TABLE products ENABLE ROW LEVEL SECURITY;` and `ALTER TABLE orders ENABLE ROW LEVEL SECURITY;`. Grant `SELECT` on active products to `anon`, but restrict all read/write operations on `orders` exclusively to the `service_role` or authenticated admin.

---

### Defect 8: PayPal Integration is Completely Absent
* **Location:** Frontend marketing copy and fake seed data claim PayPal support (*"Paid (PayPal)"*, *"Payment Method: Stripe / PayPal Protected"*).
* **Root Cause:** There is zero backend implementation for PayPal orders, capture, or webhooks.
* **Remediation:** Either implement the complete PayPal v2 Orders SDK flow or remove all claims of PayPal support until properly implemented and tested.

---

### Defect 9: Email Notifications are Non-Existent
* **Location:** `main.js` and `admin.html` claim: *"A full itemized order receipt has been dispatched to your email."*
* **Root Cause:** No email provider SDK (Resend, SendGrid, Postmark) is installed or integrated into `api/webhook.js`. No merchant notification email is sent to Shawnese.
* **Remediation:** Integrate a transactional email service (e.g. Resend) in `api/webhook.js` to dispatch branded customer receipts and notify Shawnese of new paid orders with customer shipping details.

---

### Defect 10: Fabricated Seed Orders in Admin Dashboard
* **Location:** [`admin.html:999-1081`](file:///Users/macos/Downloads/offdahook/admin.html#L999-L1081)
* **Root Cause:** `admin.html` injects hardcoded fake orders (`SEED_ORDERS` for Maya Jenkins and Danielle Brooks) into `localStorage` if no orders are found.
* **Impact:** Shawnese will see fake revenue and orders that never occurred, violating our core development rule against fake data.
* **Remediation:** Remove all fake seed orders. The dashboard must truthfully display an empty state (*"No customer orders placed yet"*) when the database is empty.

---

## 3. COMPLETE IMPLEMENTATION EVIDENCE

### A. Backend Checkout Route ([`api/checkout.js`](file:///Users/macos/Downloads/offdahook/api/checkout.js))
```javascript
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
```

---

### B. Backend Webhook Route ([`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js))
```javascript
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
```

---

### C. Backend Products Route ([`api/products.js`](file:///Users/macos/Downloads/offdahook/api/products.js))
```javascript
// ========================================================================
// OFF DA HOOK SALON SUITES - PRODUCTS & INVENTORY API (VERCEL SERVERLESS)
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Helper: Verify Admin PIN for writes
  const isAuthorized = () => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    const expected = process.env.ADMIN_PIN || 'offdahook2026';
    return pin === expected;
  };

  try {
    // GET: Fetch all products with stock
    if (req.method === 'GET') {
      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('title', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ success: true, products: data });
      }

      // Fallback to static catalog if Supabase is not yet connected
      const filePath = path.join(process.cwd(), 'assets', 'shop', 'products.json');
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const prods = JSON.parse(fileData).map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          numericPrice: parseFloat((p.price || '0').replace(/[^0-9.]/g, '')),
          stock: p.stock || 12,
          category: p.category,
          volume: p.volume,
          image: p.mainImage || p.image,
          description: p.description
        }));
        return res.status(200).json({ success: true, products: prods });
      }

      return res.status(200).json({ success: true, products: [] });
    }

    // PUT: Update stock quantity or product details
    if (req.method === 'PUT') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id, stock, price, title, category, description } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (supabase) {
        const updates = { updated_at: new Date().toISOString() };
        if (typeof stock !== 'undefined') updates.stock = parseInt(stock, 10);
        if (typeof price !== 'undefined') updates.price = parseFloat(price);
        if (title) updates.title = title;
        if (category) updates.category = category;
        if (description) updates.description = description;

        const { data, error } = await supabase
          .from('products')
          .update(updates)
          .eq('id', id)
          .select();
        if (error) throw error;
        return res.status(200).json({ success: true, product: data[0] });
      }

      return res.status(200).json({ success: true, message: 'Stock updated (local mode)' });
    }

    // POST: Add new product
    if (req.method === 'POST') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id, title, price, stock, category, volume, image, description } = req.body;
      if (!title || typeof price === 'undefined') {
        return res.status(400).json({ success: false, error: 'Title and price are required' });
      }

      const prodId = id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .insert([{
            id: prodId,
            title,
            price: parseFloat(price),
            stock: parseInt(stock, 10) || 10,
            category,
            volume: volume || 'Standard Size',
            image: image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg',
            description
          }])
          .select();
        if (error) throw error;
        return res.status(201).json({ success: true, product: data[0] });
      }

      return res.status(201).json({ success: true, message: 'Product created (local mode)' });
    }

    // DELETE: Delete or archive product
    if (req.method === 'DELETE') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id } = req.body || req.query;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (supabase) {
        const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Product archived' });
      }

      return res.status(200).json({ success: true, message: 'Product removed' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Products API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
```

---

### D. Supabase SQL Schema ([`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql))
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Products & Inventory Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 10,
  category TEXT,
  volume TEXT,
  image TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Customer Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'Paid',
  payment_method TEXT NOT NULL DEFAULT 'Stripe',
  fulfillment_status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. ENVIRONMENT VARIABLES AUDIT

| Variable Name | Environment | Required / Optional | Security Sensitivity | Current Verification State |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Vercel Serverless | **Required for Checkout** | **CRITICAL SECRET** | Set in Vercel. Must NEVER be exposed in frontend JS. |
| `STRIPE_WEBHOOK_SECRET` | Vercel Serverless | **Required for Webhooks** | **CRITICAL SECRET** | Required to verify cryptographic signature in `api/webhook.js`. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client Frontend | Optional (for Elements) | Public identifier | Safe for client usage. |
| `SUPABASE_URL` | Vercel Serverless | **Required for Database** | Public URL | Configured in Vercel project settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Serverless | **Required for DB Writes** | **CRITICAL SECRET** | Grants full PostgreSQL superuser access. Must NEVER reach the browser. |
| `ADMIN_PIN` | Vercel Serverless | **Required for Admin API** | **CRITICAL SECRET** | Currently hardcoded to `offdahook2026` if missing. Must be replaced with a secure password hash. |
| `RESEND_API_KEY` | Vercel Serverless | Required for Email | **CRITICAL SECRET** | **MISSING.** No transactional email provider is currently configured. |

---

## 5. GENUINE IMPLEMENTATIONS VS. PLACEHOLDERS

| Feature / Capability | Real Implementation Status | Evidence & Details |
| :--- | :--- | :--- |
| **Catalog Browsing & Search** | **GENUINE** | Renders on `shop.html` and `index.html`. Category filter tabs and live search function cleanly. |
| **Slide-Over Crown Bag Drawer** | **GENUINE** | Dynamic multi-item drawer, steppers, subtotal calculations, and badge updating are fully functioning in `main.js`. |
| **Supabase Products Read/Write** | **GENUINE** | `GET /api/products` and `PUT /api/products` execute genuine PostgreSQL queries against Supabase when credentials are provided. |
| **Stripe Checkout Session** | **GENUINE (WITH DEFECTS)** | Successfully calls Stripe API, but suffers from client-side pricing vulnerability and lack of return verification. |
| **Stripe Webhook Processing** | **DEFECTIVE** | Code exists, but raw-body signature verification fails in Vercel and idempotency is completely absent. |
| **PayPal Integration** | **100% PLACEHOLDER** | Zero backend code. Appears only as text labels and in fake seed order data. |
| **Email Receipts & Notifications** | **100% PLACEHOLDER** | No email provider configured. Zero transactional emails are dispatched by the application. |
| **Shipment Tracking** | **100% PLACEHOLDER** | Only a binary toggle (*Pending* vs *Shipped*). No courier selection, tracking number input, or tracking links. |
| **Admin Dashboard Security** | **DEFECTIVE / INSECURE** | Client-side PIN check only. No sessions, no password hashing, no CSRF/brute-force protection. |
| **Database Concurrency & RLS** | **DEFECTIVE / INSECURE** | No Row Level Security policies. No atomic reservation stored procedures. |

---

## 6. REQUIRED CORRECTIVE ACTION PLAN

Before declaring production readiness, the following architectural steps must be executed:

1. **Step 1: Database Hardening & Atomic Reservation Function**
   * Enable RLS on `products` and `orders`.
   * Add `CHECK (stock >= 0)` constraints.
   * Create `payment_events` table for webhook idempotency.
   * Deploy PostgreSQL stored procedure `deduct_product_stock_atomic` to prevent overselling.

2. **Step 2: Server-Side Pricing Verification in `api/checkout.js`**
   * Ignore client-supplied prices. Fetch authoritative prices from Supabase `products` table.
   * Add shipping rate configuration.

3. **Step 3: Webhook Hardening & Idempotency in `api/webhook.js`**
   * Configure raw buffer parsing for Vercel.
   * Enforce signature check; remove fallback.
   * Check for duplicate `session.id` to prevent double stock deduction.
   * Use collision-safe Order IDs (e.g., `ODH-YYYYMMDD-XXXX`).

4. **Step 4: Real Email Delivery Service Integration**
   * Integrate Resend / SendGrid in `api/webhook.js`.
   * Dispatch branded customer receipts and notify Shawnese on verified payment.

5. **Step 5: Admin Security & Session Authentication**
   * Replace client-side PIN check with server-side authentication (`/api/auth/login`) returning HttpOnly cookies.
   * Remove fake seed orders from `admin.html`.
   * Protect `/api/orders` with verified session tokens.

6. **Step 6: Eliminate Fake Confirmations & Add Verified Success Page**
   * Remove `showCheckoutModal` fake order creation.
   * Implement `/api/verify-session` to verify Stripe payment state on the return URL before displaying confirmation.

