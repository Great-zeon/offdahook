# Off Da Hook Salon Suites — Human Action Register
**Date**: November 12, 2026  
**Objective**: Non-Delegable Staging Verification & Merchant Actions Prior to Production Rollout  
**Status**: PENDING HUMAN EXECUTION  

---

## 1. Zero-Trust Policy

**Do NOT run the SQL migration on the production Supabase database first.** Complete every staging gate below on an isolated staging Supabase project + Vercel Preview + Stripe Test Mode before preparing production deployment.

---

## 2. Action Checklist

| ID | Category | Required Action | Location | Status |
| :---: | :--- | :--- | :--- | :---: |
| **ACT-01** | **Staging Database Migration** | Execute [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) in an isolated **Staging Supabase SQL Editor** (twice to verify repeatability). | Staging Supabase SQL Editor | **PENDING** |
| **ACT-02** | **Vercel Staging Environment** | Configure `STOREFRONT_URL`, `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MERCHANT_ALERT_EMAIL`, `ADMIN_PIN`, and `CRON_SECRET`. | Vercel Project Settings (Preview) | **PENDING** |
| **ACT-03** | **Stripe Test-Mode Webhook** | Register `https://<staging-domain>/api/webhook` in Stripe Dashboard (Test Mode) for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. | Stripe Dashboard > Webhooks | **PENDING** |
| **ACT-04** | **Resend Domain & Webhook** | Verify `offdahookhairsalon.com` SPF/DKIM DNS records and register `https://<staging-domain>/api/resend-webhook` for `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`. | Resend Dashboard & DNS | **PENDING** |
| **ACT-05** | **Staging E2E & Admin Verification** | Complete Stripe Test-Mode checkout (`4242 4242 4242 4242`) + verify Supabase (`orders`, `products`, `checkout_intents`, `webhook_events`, `order_notifications`) + verify `admin.html` inventory CRUD & order actions. | Staging URL & Supabase | **PENDING** |

---

## 3. Step-by-Step Staging Execution Guide

### Step 1: Isolated Staging Schema Execution (ACT-01)
1. Provision a disposable/staging Supabase project.
2. Review [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) against the staging database schema first to confirm compatibility with existing constraints/data (note: duplicate `stripe_session_id` rows intentionally halt with `MIGRATION BLOCKED` so historical IDs are never rewritten).
3. Open the Staging SQL Editor, paste and execute the schema once, verify table/function compilation (`products`, `orders`, `webhook_events`, `checkout_intents`, `order_notifications`, `process_paid_order_atomic`, `record_webhook_failure`, `claim_pending_notifications`, `deduct_product_stock_atomic`), and confirm idempotent re-execution only after inspecting results.

### Step 2: Staging Environment & Webhooks (ACT-02, ACT-03, ACT-04)
1. Set all environment variables documented in [`.env.example`](file:///Users/macos/Downloads/offdahook/.env.example) in Vercel Preview scope (always use an authorized test inbox for `MERCHANT_ALERT_EMAIL` / `CONTACT_ALERT_EMAIL` during staging—never send test emails to real customers).
2. Add Stripe Test-Mode webhook pointing to `https://<staging-domain>/api/webhook` and store `STRIPE_WEBHOOK_SECRET`.
3. Add Resend webhook pointing to `https://<staging-domain>/api/resend-webhook` (`email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`) and store `RESEND_WEBHOOK_SECRET`.
4. Deploy/redeploy Vercel Preview.

### Step 3: Live Test-Mode Checkout & Admin Verification (ACT-05)
1. Navigate to `https://<staging-domain>/shop.html`, add an item, and click **Proceed to Secure Checkout**.
2. Pay with Stripe test card `4242 4242 4242 4242`.
3. Confirm redirect to `/shop.html?order=success&session_id=...` shows persisted Order ID (`ODH-...`) and purchased item list.
4. Verify in Staging Supabase:
   - `checkout_intents`: row `status = 'completed'`, linked `stripe_session_id`, exact integer `total_cents`.
   - `orders`: 1 row with genuine ID, `fulfillment_status = 'Pending'`, exact amount.
   - `products`: `stock` decremented by exact purchased quantity.
   - `webhook_events`: event marked `completed`.
   - `order_notifications`: `merchant_order_alert` & `customer_order_receipt` reach `accepted` -> `delivered`.
5. Log in to `https://<staging-domain>/admin.html` with `ADMIN_PIN`, verify order visibility, tracking update persistence, and product stock adjustment persistence across page reloads.
