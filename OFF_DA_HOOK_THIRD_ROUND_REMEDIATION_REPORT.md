# OFF DA HOOK SALON SUITES — THIRD-ROUND ZERO-TRUST HARDENING REPORT
**Date:** November 11, 2026  
**Repository:** `Great-zeon/offdahook` (Branch: `main`)  
**Previous Baseline Commit:** `1823eab`  
**Classification:** **NOT PRODUCTION READY — READY FOR STAGING VERIFICATION ONLY**  

---

## 1. Honest Execution & Environment Scope Disclaimer

Under zero-trust engineering protocols:
- No migrations were executed against the live production Supabase database (`xtdoqeoaflhvdduygndr`).
- No real credit card charges or live Stripe payments were initiated.
- Live PostgreSQL server runtime and Vercel staging endpoint network execution remain **BLOCKED / NOT TESTED** until deployed to an isolated staging database and executed by a human with Stripe test-mode credentials.
- All 56 automated checks executed under `/usr/bin/python3` validate PL/pgSQL transaction semantics, concurrency state transitions, unit validation boundaries, and direct on-disk code assertions across all workspace files.

---

## 2. Third-Round Defects Remediated

1. **Strict Catalog Validation (`schema.sql`, `OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`)**:
   - Eliminated silent inner-join omission of invalid product IDs.
   - Added `IF NOT FOUND` exception on product lookup, `is_active = FALSE` rejection, and `track_inventory` column enforcement inside `process_paid_order_atomic`.
   - Unknown or inactive items abort the entire transaction cleanly with zero order persisted and zero stock deducted.
2. **In-Flight Concurrency Lease & Recovery (`schema.sql`, `api/webhook.js`)**:
   - Eliminated false `duplicate: true` / HTTP 200 acknowledgements for active in-flight events.
   - `process_paid_order_atomic` returns `{ success: false, in_flight: true, duplicate: false, order_id: null }` while a processing lease is active (<30s).
   - `api/webhook.js` responds with **HTTP 503 Service Unavailable** + `Retry-After: 5` on `in_flight`, preserving Stripe's retry contract.
   - Leases older than 30 seconds are safely reclaimed on retry.
3. **External Stripe Identifier Preservation (`schema.sql`)**:
   - Completely removed rewriting of historical `stripe_session_id` values (`|| '_dup_' ||`).
   - Migration inspects historical rows and executes `RAISE EXCEPTION 'MIGRATION BLOCKED: ...'` listing conflicting session IDs and order IDs if unresolved duplicates exist.
   - Safe unique index `idx_orders_stripe_session_uniq` is created only when 0 duplicate non-null sessions exist.
4. **Durable Notification Outbox (`schema.sql`, `api/_notification-outbox.js`, `api/notifications-retry.js`, `api/webhook.js`)**:
   - Created `order_notifications` table storing separate jobs (`merchant_order_alert`, `customer_order_receipt`, `merchant_shortfall_alert`, `customer_backorder_notice`) with tracking states (`queued`, `processing`, `accepted`, `failed`, `retrying`), attempt counts, backoff timestamps (`next_retry_at`), sanitized errors, and provider message IDs.
   - Outbound Resend HTTP calls enforce a strict 10,000ms network timeout.
   - Duplicate webhook deliveries self-heal by checking for and dispatching pending outbox jobs (`dispatchOrderNotifications(supabase, rpcData.order_id)`).
   - Added protected retry endpoint `api/notifications-retry.js` gated by HMAC-SHA256 admin bearer token (`verifyToken(token, masterPin)`) or timing-safe `CRON_SECRET`.
5. **Server-Authoritative Checkout Intents (`schema.sql`, `api/checkout.js`, `api/webhook.js`, `api/verify-session.js`, `api/_payment-validation.js`)**:
   - Created `checkout_intents` table storing authoritative items, prices, subtotals, shipping ($6.95), totals, currency, and expiration.
   - Eliminated `.slice(0, 500)` JSON truncation on Stripe metadata; sessions store opaque `checkout_intent_id`.
   - `validateStripeSession` reconciles checkout intent status (rejecting `cancelled`/`expired`), Stripe session ownership (`INTENT_SESSION_MISMATCH`), currency matching (`INTENT_CURRENCY_MISMATCH`), and paid amount (`AMOUNT_MISMATCH`).
6. **Canonical Storefront Origin Security (`api/_payment-validation.js`, `api/checkout.js`, `api/auth.js`, `api/orders.js`, `api/products.js`, `api/verify-session.js`, `api/notifications-retry.js`)**:
   - Replaced wildcard `Access-Control-Allow-Origin: *` and arbitrary `req.headers.origin` redirects with shared `applySecureCors` and `resolveSafeOrigin`.
   - Unexpected origins fall back strictly to `process.env.STOREFRONT_URL || 'https://offdahook.vercel.app'`.
7. **Immutable Completed Webhook Lifecycle (`schema.sql`)**:
   - Hardened `record_webhook_failure` to check both `webhook_events.status = 'completed'` and existing committed orders for `p_session_id`, guaranteeing late failure logging can never overwrite a completed order event.
8. **Explicit Async Payment Failure Handling (`api/webhook.js`)**:
   - Explicitly handles `checkout.session.async_payment_failed`, logs failure durably, marks linked checkout intent `'cancelled'`, and confirms zero order creation and zero stock deduction.
9. **Frontend Reconciliation & Missing Import Fixes (`main.js`, `api/checkout.js`, `api/notifications-retry.js`)**:
   - Fixed missing `require('crypto')` in `api/checkout.js`.
   - Fixed 2-argument `verifyToken(token, masterPin)` signature call in `api/notifications-retry.js`.
   - Fixed pending session reference display in `main.js` (`data.session_ref || (data.session_id || '').slice(-12)`).

---

## 3. Repository Security Review Findings (Direct Code Audit)

| Security Check | Observed Outcome | Status |
| :--- | :--- | :---: |
| Hardcoded Secrets (`sk_live`, `sk_test`, `whsec_`, `re_`, service role key) | 0 secrets found via grep across workspace; all runtime keys read via `process.env`. | **PASS** |
| Wildcard CORS (`Access-Control-Allow-Origin: *`) | 0 wildcard headers remain across all `api/*.js` routes; unified under `applySecureCors`. | **PASS** |
| Client-Controlled Prices | Ignored completely; prices pulled from `products` table and stored in `checkout_intents`. | **PASS** |
| Unauthenticated Admin/Notification Write Access | `/api/orders`, `/api/products` (PUT/POST/DELETE), and `/api/notifications-retry` require verified HMAC-SHA256 admin token or cron secret. | **PASS** |
| SQL Privilege Escalation | `process_paid_order_atomic`, `record_webhook_failure`, `deduct_product_stock_atomic` pin `search_path = public, pg_temp` and revoke execution from `PUBLIC, anon, authenticated`. | **PASS** |
| Synthetic Order IDs | Eliminated; unpersisted sessions return `order_persisted: false, status: 'payment_verified_order_pending'`. | **PASS** |

---

## 4. Verification Status & Remaining Blockers

| Stage | Status | Classification | Blocking Requirement |
| :--- | :--- | :---: | :--- |
| Automated Logic & Static Regression Suite (56 tests) | Executed via `/usr/bin/python3` | **PASS (56/56)** | None |
| Real PostgreSQL Server Migration Dry-Run (Clean / Non-Unique / Duplicate DBs) | Awaits Staging PostgreSQL Instance | **BLOCKED** | Staging Supabase URL / Postgres URI |
| Multi-Worker HTTP Concurrency Test Against Live PostgreSQL Locks | Awaits Staging Environment | **BLOCKED** | Deployed Staging API + Postgres |
| Live Stripe Test-Mode Checkout, Webhook Delivery & Resend Email Trace | Awaits Human Credentials & Staging Deploy | **BLOCKED** | Vercel staging env + `STRIPE_WEBHOOK_SECRET` + `RESEND_API_KEY` |
