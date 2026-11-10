# OFF DA HOOK — INDEPENDENT POST-HARDENING AUDIT & CRITICAL REVIEW
**Review Target:** Implementation State at Commit `de9ea70`  
**Live Site:** `https://offdahook.vercel.app/`  
**Auditor:** Independent Principal QA & Application Security Reviewer  
**Audit Date:** November 10, 2026  
**Audit Standard:** Zero-Trust Adversarial Review; Objective Evidence Over Confidence

---

## 1. EXECUTIVE ASSESSMENT: IMPLEMENTED VS. CLAIMED

While commit `de9ea70` successfully eradicated prototype illusions (eliminating client-controlled price injection and the client-side fake checkout modal that marked unpaid orders as "Paid"), **an adversarial inspection reveals that several claims in the previous reports were premature or overstated.**

### Reality vs. Claim Matrix

| Area | Previous Hardening Claim | Actual Implementation Reality | Threat / Risk Assessment |
| :--- | :--- | :--- | :--- |
| **Server-Side Pricing** | "100% immune to price tampering." | **VERIFIED.** Server queries Supabase `products` table and computes line items from DB prices. Client `item.price` is ignored. | **PASS.** Low risk. |
| **Webhook Idempotency** | "Duplicate webhooks rejected safely with zero double deductions." | **PARTIALLY DEFECTIVE.** Code uses check-then-act (`SELECT ... WHERE stripe_session_id = ...`) in Node.js. If two webhooks arrive concurrently, both pass the check before either commits. | **CRITICAL RISK.** Concurrent replay can cause duplicate deductions. |
| **Payment Reconciliation** | "Every paid order recoverable." | **DEFECTIVE.** `/api/verify-session.js` checks Stripe, but if the webhook failed or delayed, it **fails to create the missing order in Supabase**. Order is confirmed to the user but lost from the merchant dashboard. | **CRITICAL RISK.** Customer pays, arrives on site, but order record never exists in DB. |
| **Inventory Concurrency** | "Concurrency-safe atomic deduction." | **PARTIALLY DEFECTIVE.** Procedure `deduct_product_stock_atomic` exists, but order insertion and stock deduction are **non-transactional** across separate HTTP calls. Failure between calls causes inconsistent state. | **HIGH RISK.** Partial fulfillment failure leaves orphaned state. |
| **Admin Authentication** | "Protected by Authorization: Bearer <TOKEN>." | **CRITICALLY INSECURE.** The "Bearer token" is literally the plaintext `ADMIN_PIN` stored in `sessionStorage`. Zero cryptographic signature, zero expiration, zero brute-force protection. | **CRITICAL SECURITY RISK.** Anyone can brute-force the PIN via `/api/orders`. |
| **Database Migration** | "Hardened schema ready to run." | **DEFECTIVE ON EXISTING TABLES.** Uses `CREATE TABLE IF NOT EXISTS`. If tables already exist in Supabase, new columns (`carrier`, `tracking_number`) and CHECK constraints are **never added**. | **HIGH RISK.** Silently fails to apply constraints. |
| **Email Delivery** | "Automated receipts via Resend." | **BLOCKED / UNVERIFIED.** Code exists, but zero delivery tracking exists in DB. If Resend fails, no record of failure is retained, and no retry or manual resend mechanism exists. | **MEDIUM RISK.** Silent delivery failure. |
| **Shipment Tracking** | "Tracking number & courier updates." | **MANUAL ENTRY ONLY.** No courier API integration. Only saves strings to database. | **INFORMATIONAL.** Must be documented as manual fulfillment. |

---

## 2. DEEP DIVE: THE SIX CRITICAL CONCERNS

### Concern 1: Webhook Duplicate Protection & Concurrency Race
* **Code Reference:** [`api/webhook.js:75-102`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L75-L102)
* **Finding:** The function queries `supabase.from('orders').select('id').eq('stripe_session_id', session.id).maybeSingle()`.
* **Vulnerability:** Under simultaneous webhook deliveries (e.g. Stripe dual-dispatch on network delay), both execution threads execute the `SELECT` query before either executes the `INSERT`. Both see null. Both proceed to deduct stock.
* **Fix Required:** The event lock MUST be acquired atomically in PostgreSQL using `INSERT INTO webhook_events (id, event_type) VALUES (event.id, ...)` *before* any processing occurs. If PostgreSQL returns a unique constraint error (code `23505`), the request must immediately return HTTP 200 without touching inventory.

### Concern 2: Webhook Failure & Self-Healing Order Reconciliation
* **Code Reference:** [`api/verify-session.js:50-80`](file:///Users/macos/Downloads/offdahook/api/verify-session.js#L50-L80)
* **Finding:** When a customer returns to `shop.html?order=success&session_id=cs_...`, `/api/verify-session` queries Stripe and confirms `session.payment_status === 'paid'`. It then checks `orders` in Supabase. If `orders` is empty (because the webhook timed out, failed, or was delayed by Vercel cold boot), `/api/verify-session` generates a dummy receipt ID (`ODH-REC-...`) and returns success to the user, **without creating the order in the database**.
* **Impact:** The customer believes their order is confirmed. Shawnese never sees the order in `admin.html` because it does not exist in Supabase.
* **Fix Required:** `/api/verify-session.js` must implement **Self-Healing Lazy Reconciliation**. If `session.payment_status === 'paid'` and the order does not exist in Supabase, `/api/verify-session.js` must atomically insert the order, deduct stock, log the event, and return the true reconciled order ID.

### Concern 3: Transactional Atomicity (Order Insertion + Inventory Deduction)
* **Code Reference:** [`api/webhook.js:125-178`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L125-L178)
* **Finding:** The webhook first executes `supabase.from('orders').insert(...)` and then loops through items executing `supabase.rpc('deduct_product_stock_atomic', ...)`.
* **Vulnerability:** These are distinct, non-atomic HTTP round-trips to Supabase. If Vercel terminates the function midway (e.g. CPU timeout or network hiccup), the order is inserted but inventory is not deducted.
* **Fix Required:** Encapsulate order insertion, webhook event recording, and stock deduction inside a single PostgreSQL stored procedure `process_paid_order_atomic(p_order, p_items, p_event_id)` running inside a single `BEGIN ... COMMIT` block.

### Concern 4: Insecure Administrator Authentication & Token Handling
* **Code Reference:** [`api/orders.js:20-30`](file:///Users/macos/Downloads/offdahook/api/orders.js#L20-L30), [`admin.html:1150-1185`](file:///Users/macos/Downloads/offdahook/admin.html#L1150-L1185)
* **Finding:** The application sends the plaintext `ADMIN_PIN` in the `Authorization: Bearer <TOKEN>` header.
* **Vulnerabilities:**
  1. No session expiration: The token never expires.
  2. No session tokens: The PIN itself is the token.
  3. No brute-force protection: An attacker can send 10,000 requests to `/api/orders` in parallel until finding the PIN.
  4. Stored in `sessionStorage` in plaintext.
* **Fix Required:**
  1. Dedicated login route `/api/auth` that validates the PIN, enforces IP rate-limiting, and issues a cryptographically signed HMAC-SHA256 session token with an 8-hour expiration (`exp`).
  2. `/api/orders` and `/api/products` verify the signature and expiration of this token.
  3. Constant-time comparison `crypto.timingSafeEqual` to prevent timing attacks.

### Concern 5: Unsafe Database Migrations (`schema.sql`)
* **Code Reference:** [`schema.sql:10-45`](file:///Users/macos/Downloads/offdahook/schema.sql#L10-L45)
* **Finding:** The script uses `CREATE TABLE IF NOT EXISTS products ...` and `CREATE TABLE IF NOT EXISTS orders ...`.
* **Vulnerability:** If the database already had `products` and `orders` from previous sessions (which it does), `CREATE TABLE IF NOT EXISTS` **does nothing**. It will NOT add the new columns (`carrier`, `tracking_number`, `tracking_url`, `updated_at`) and will NOT add the non-negative check constraints!
* **Fix Required:** Replace static `CREATE TABLE` with an idempotent migration script using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` and `ALTER TABLE ... ADD CONSTRAINT ...`.

### Concern 6: Email Failure Visibility
* **Code Reference:** [`api/webhook.js:60-70`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L60-L70)
* **Finding:** If Resend returns an error or is unconfigured, the error is caught and logged to Vercel console, but no record is kept in the database.
* **Fix Required:** Add `email_receipt_sent BOOLEAN DEFAULT FALSE` to `orders`. If Resend succeeds, set to `TRUE`. If it fails, leave `FALSE` so Shawnese can see the email status in `admin.html` and click a "Resend Receipt" button.
