# Off Da Hook Salon Suites — Human Action Register
**Date**: November 11, 2026  
**Auditor**: Zero-Trust Security & Systems Architect  
**Objective**: Non-Delegable Staging Verification & Merchant Actions Prior to Production Migration  
**Status**: PENDING HUMAN EXECUTION  

---

## 1. Zero-Trust Policy

Under zero-trust engineering rules, **do NOT run the migration on the live production Supabase database first**. Verify all steps on an isolated staging Supabase project and Stripe Test Mode first, confirm every end-to-end record, and only then schedule production rollout.

---

## 2. Action Checklist

| ID | Category | Required Action | Location | Status |
| :---: | :--- | :--- | :--- | :---: |
| **ACT-01** | **Staging Database Migration** | Run [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) in an isolated **Staging Supabase SQL Editor** first (reconcile any duplicate `stripe_session_id` alerts manually if raised). | Staging Supabase SQL Editor | **PENDING** |
| **ACT-02** | **Vercel Environment Variables** | Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_PIN`, `STOREFRONT_URL`, and `CRON_SECRET` in Vercel Preview/Staging environment. | [Vercel Project Settings](https://vercel.com/) | **PENDING** |
| **ACT-03** | **Stripe Test-Mode Webhook** | Register `https://<staging-domain>/api/webhook` in Stripe Dashboard (Test Mode) for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. | [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/) | **PENDING** |
| **ACT-04** | **Resend Domain Verification** | Verify `offdahookhairsalon.com` SPF/DKIM DNS records in Resend so `@offdahookhairsalon.com` outbound emails are accepted by recipient MTAs. | [Resend Dashboard](https://resend.com/) & Domain DNS | **PENDING** |
| **ACT-05** | **Staging End-to-End Test Purchase** | Complete a full Stripe Test Mode purchase (`4242...`) on staging and verify DB rows (`orders`, `products`, `checkout_intents`, `webhook_events`, `order_notifications`). | Staging Storefront & Supabase Tables | **PENDING** |

---

## 3. Step-by-Step Staging Verification Instructions

### Step 1: Staging Schema Execution (ACT-01)
1. Provision or select your **Staging** Supabase project.
2. Open SQL Editor and paste [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql).
3. Click **Run**.
   - Note: If unresolved duplicate `stripe_session_id` rows exist, the script will halt cleanly with `MIGRATION BLOCKED` and list affected order IDs without altering historical Stripe identifiers.
4. Confirm `products`, `orders`, `webhook_events`, `checkout_intents`, `order_notifications`, `process_paid_order_atomic`, and `record_webhook_failure` exist.

### Step 2: Configure Staging Secrets & Webhook (ACT-02 & ACT-03)
1. In Stripe Dashboard (**Test Mode** > **Developers > Webhooks**), add your staging `/api/webhook` URL.
2. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
3. Set `STOREFRONT_URL` in Vercel (e.g. `https://offdahook.vercel.app`) along with `ADMIN_PIN`, `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, and `RESEND_API_KEY`.
4. Redeploy Vercel preview/staging build.

### Step 3: Execute End-to-End Test-Mode Purchase (ACT-05)
1. Open staging `/shop.html`, add products to cart, and click **Proceed to Secure Checkout**.
2. Verify Stripe Checkout redirects to Stripe hosted page and complete payment using Stripe test card `4242 4242 4242 4242`.
3. Verify return redirect lands cleanly on `/shop.html?order=success&session_id=...` and triggers `/api/verify-session`.
4. Confirm in Staging Supabase:
   - `checkout_intents` row transitions from `pending` to `completed`.
   - `orders` contains 1 row with genuine server-generated ID (`ODH-...`) and matching `stripe_session_id`.
   - `products.stock` decremented by exact purchased quantity.
   - `webhook_events` event marked `completed`.
   - `order_notifications` outbox contains queued/accepted records for both `merchant_order_alert` and `customer_order_receipt`.
5. Only after all 5 staging verifications pass should ACT-01..ACT-04 be repeated for Production.
