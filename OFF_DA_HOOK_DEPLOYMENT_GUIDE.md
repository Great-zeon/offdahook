# OFF DA HOOK — COMPLETE VERCEL & SUPABASE DEPLOYMENT GUIDE
**Project:** Off Da Hook Salon Suites E-Commerce Application  
**Target Domains:** `https://offdahook.vercel.app` & `https://www.offdahookhairsalon.com`  
**Database Host:** Supabase Cloud (PostgreSQL)  
**API Engine:** Vercel Serverless Functions (`api/*.js`)  
**Payment Gateway:** Stripe Hosted Checkout & Webhooks  
**Email Engine:** Resend Transactional Email REST API

---

## 1. ARCHITECTURE OVERVIEW

The Off Da Hook production stack operates on a high-availability, zero-maintenance serverless architecture:

```
[Customer Browser / Mobile]
       │
       ▼ (HTTPS)
[Vercel Global Edge CDN] ─────── Static Pages (index.html, shop.html, admin.html, main.js)
       │
       ▼
[Serverless Functions]
   ├── POST /api/checkout  ──────► [Stripe Hosted Checkout] (Card, Apple Pay, Google Pay)
   ├── POST /api/webhook   ◄────── [Stripe Webhook Events] (HMAC-SHA256 Cryptographic Sig)
   │         │
   │         ├──► [Supabase PostgreSQL] (Orders, Inventory, Webhook Events, Atomic RLS)
   │         │
   │         └──► [Resend REST API] ────► Customer Receipt & Shawnese Alert
   │
   ├── GET  /api/products  ──────► [Supabase] (Active Catalog & Live Stock)
   ├── PUT  /api/products  ──────► [Supabase] (Protected by Authorization: Bearer <ADMIN_PIN>)
   ├── GET  /api/orders    ──────► [Supabase] (Protected by Authorization: Bearer <ADMIN_PIN>)
   └── GET  /api/verify-session ─► [Stripe API] (Validates payment before showing confirmation)
```

---

## 2. STEP 1: SUPABASE DATABASE INITIALIZATION

1. Navigate to your Supabase Project Dashboard:
   `https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr`
2. Click **SQL Editor** on the left menu.
3. Click **New Query** (or open existing).
4. Copy the entire contents of [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) from this repository.
5. Paste into the editor and click **Run** (green button).
6. Verify the output displays:
   - `CREATE TABLE products`
   - `CREATE TABLE orders`
   - `CREATE TABLE webhook_events`
   - `CREATE FUNCTION deduct_product_stock_atomic`
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - Policies created for products, orders, and webhook events.
7. Navigate to **Table Editor** on the left to verify all 12 signature hair care formulas are populated in the `products` table.

---

## 3. STEP 2: CONFIGURE VERCEL ENVIRONMENT VARIABLES

1. Log into your Vercel Dashboard:
   `https://vercel.com/dashboard`
2. Select your project: **offdahook**.
3. Navigate to **Settings > Environment Variables**.
4. Add the following environment variables for **Production**, **Preview**, and **Development**:

| Variable Name | Value / Description | Sensitive |
| :--- | :--- | :---: |
| `STRIPE_SECRET_KEY` | `sk_test_...` (for testing) or `sk_live_...` (for production) | **YES** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (copied from Stripe Webhook setup in Step 4) | **YES** |
| `SUPABASE_URL` | `https://xtdoqeoaflhvdduygndr.supabase.co` | NO |
| `SUPABASE_SERVICE_ROLE_KEY` | Your secret `sb_secret_prs...` service role key from Supabase API Keys | **YES** |
| `ADMIN_PIN` | A secure private passcode chosen by Shawnese Parker (e.g. `CrownPass#2026`) | **YES** |
| `RESEND_API_KEY` | `re_...` (from your Resend.com account) | **YES** |
| `MERCHANT_ALERT_EMAIL` | `offdahooksalon@gmail.com` | NO |

> [!IMPORTANT]
> Never put the `SUPABASE_SERVICE_ROLE_KEY` into frontend HTML or JavaScript files. It is strictly accessed by Vercel serverless functions in the `api/` directory.

---

## 4. STEP 3: CONFIGURE STRIPE WEBHOOK ENDPOINT

For orders to automatically write into your Supabase database and deduct inventory:

1. Log into the Stripe Dashboard:
   `https://dashboard.stripe.com`
2. If testing, ensure **Test Mode** is enabled at the top right. If launching live, ensure **Live Mode** is enabled.
3. Go to **Developers > Webhooks**.
4. Click **Add endpoint** (top right).
5. **Endpoint URL:** `https://offdahook.vercel.app/api/webhook`
   *(Or your custom domain: `https://www.offdahookhairsalon.com/api/webhook`)*
6. **Select events to listen to:**
   - Under `Checkout`, check: `checkout.session.completed`
   - Under `Charge`, check: `charge.refunded`
7. Click **Add endpoint**.
8. In the newly created webhook page, locate **Signing Secret** on the right, click **Reveal**, and copy the `whsec_...` string.
9. Paste this value into Vercel as `STRIPE_WEBHOOK_SECRET`.
10. If you change environment variables in Vercel, trigger a **Redeploy** under **Deployments > Redeploy** so the serverless functions pick up the new variables.

---

## 5. STEP 4: TESTING THE CHECKOUT PIPELINE IN TEST MODE

Before accepting real credit cards:

1. Set `STRIPE_SECRET_KEY` in Vercel to your test key (`sk_test_...`).
2. Go to `https://offdahook.vercel.app/shop.html`.
3. Add a product (e.g., "Xxxtra Strength Regrowth Serum" - $25.00) to your Crown Bag.
4. Click **Proceed to Secure Checkout**.
5. You should be smoothly redirected to Stripe's hosted checkout page.
6. Enter the standard Stripe test card:
   - **Card Number:** `4242 4242 4242 4242`
   - **Exp:** Any future date (e.g., `12/28`)
   - **CVC:** `123`
   - **Name:** Test Customer
   - **Shipping Address:** Any valid US street address (e.g., 25300 Rockaway Blvd, Rosedale, NY 11422)
7. Click **Pay**.
8. Stripe will process the test payment and redirect you back to `shop.html?order=success&session_id=cs_test_...`.
9. The storefront will call `/api/verify-session`, verify the payment with Stripe, clear your Crown Bag, and display the luxury **"Crown Order Confirmed!"** modal with your Order ID.
10. Check the Admin Dashboard at `https://offdahook.vercel.app/admin.html`:
    - Enter your `ADMIN_PIN`.
    - Go to **Orders**. Your new verified order will appear at the top.
    - Click **View Receipt** to inspect the printable client receipt.

---

## 6. STEP 5: TRANSITIONING TO PRODUCTION LIVE PAYMENTS

When Shawnese is ready to accept real money:

1. In Stripe Dashboard, switch from **Test mode** to **Live mode**.
2. Copy your live keys:
   - `sk_live_...` -> Update `STRIPE_SECRET_KEY` in Vercel.
   - Create a live webhook pointing to `https://offdahook.vercel.app/api/webhook` and copy the live `whsec_...` -> Update `STRIPE_WEBHOOK_SECRET` in Vercel.
3. In Vercel, click **Redeploy** on the latest deployment.
4. Run one live test transaction using Shawnese's real debit card for a $15 or $20 product (e.g., Braid Jam).
5. Verify funds appear in the Stripe balance and an email receipt arrives in her inbox.
6. You can immediately refund the test charge inside the Stripe dashboard.
