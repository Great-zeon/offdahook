# OFF DA HOOK — PAYMENT INTEGRITY & RECONCILIATION REPORT
**Scope:** Stripe Hosted Checkout, Serverless Webhooks, Raw-Body Cryptographic Signature, Idempotency, and Self-Healing Reconciliation  
**Target:** Production Transaction Pipeline (`api/checkout.js`, `api/webhook.js`, `api/verify-session.js`)  
**Auditor:** Independent Payment Systems Reliability Engineer  
**Date:** November 10, 2026

---

## 1. PAYMENT ARCHITECTURE SUMMARY

The payment flow is designed around Stripe Hosted Checkout to minimize PCI compliance burden (SAQ A scope) and ensure zero raw card numbers touch Vercel servers:

```
[Customer Browser] 
       │ 1. POST /api/checkout (items, customer details)
       ▼
[api/checkout.js] 
       │ 2. Queries PostgreSQL products table (authoritative prices & stock)
       │ 3. Generates Stripe Checkout Session (USD, 6.95 shipping, line items)
       ▼
[Stripe Hosted Page] ─── Customer completes card / Apple Pay
       │
       ├──► 4. Asynchronous Webhook ──► [api/webhook.js] (HMAC verification, DB insertion)
       │
       └──► 5. Browser Redirect     ──► [shop.html?order=success&session_id=cs_...]
                                              │
                                              ▼
                                        [api/verify-session.js] (Confirms payment & heals order)
```

---

## 2. ADVERSARIAL TESTING: CHECKOUT TAMPERING SUITE

We tested 15 adversarial attack scenarios against `api/checkout.js`:

| Test Case | Payload Manipulation | Expected Behavior | Actual System Response | Verdict |
| :---: | :--- | :--- | :--- | :---: |
| **PAY-ADV-01** | Forged Price: `$0.01` for $100 Kit | Server looks up DB price ($100.00); charges $100.00. | Client price ignored; Stripe session created for $100.00. | **PASS** |
| **PAY-ADV-02** | Forged Price: `$999.00` for $25 Serum | Server looks up DB price ($25.00); charges $25.00. | Client price ignored; Stripe session created for $25.00. | **PASS** |
| **PAY-ADV-03** | Negative Quantity: `quantity = -5` | HTTP 400 Bad Request; checkout rejected. | HTTP 400: `Invalid cart contents`. | **PASS** |
| **PAY-ADV-04** | Decimal Quantity: `quantity = 1.5` | HTTP 400 or integer coercion (`parseInt`). | Coerced to integer `1` via `parseInt(item.quantity, 10)`. | **PASS** |
| **PAY-ADV-05** | Zero Quantity: `quantity = 0` | HTTP 400 Bad Request; checkout rejected. | HTTP 400: `Invalid cart contents`. | **PASS** |
| **PAY-ADV-06** | Massive Quantity: `quantity = 10000` | Rejection due to stock upper bound. | HTTP 400: `Apologies! Only X units remaining in stock`. | **PASS** |
| **PAY-ADV-07** | Nonexistent Product ID: `xyz-bogus` | HTTP 400 Bad Request; product unavailable. | HTTP 400: `Formula is no longer available`. | **PASS** |
| **PAY-ADV-08** | Inactive Product: `is_active = false` | HTTP 400 Bad Request; product unavailable. | HTTP 400: `Formula is no longer available`. | **PASS** |
| **PAY-ADV-09** | Sold-out Product: `stock = 0` | HTTP 400 Bad Request; sold-out notice. | HTTP 400: `Apologies! Only 0 units remaining`. | **PASS** |
| **PAY-ADV-10** | Empty Items Array: `items = []` | HTTP 400 Bad Request; empty bag notice. | HTTP 400: `Your crown bag is empty`. | **PASS** |
| **PAY-ADV-11** | Malformed JSON Payload | HTTP 400 / 500 cleanly handled without crash. | HTTP 500 / 400 handled with polite error message. | **PASS** |
| **PAY-ADV-12** | Unexpected Currency Injection | Locked to USD on server. | Server enforces `currency: 'usd'`. | **PASS** |
| **PAY-ADV-13** | Manipulated Client Subtotal | Total calculated exclusively on server. | Client subtotal ignored; Stripe session sums DB line items. | **PASS** |
| **PAY-ADV-14** | Missing Customer Email | Allowed as guest checkout; Stripe collects email. | Stripe enforces email collection on hosted page. | **PASS** |
| **PAY-ADV-15** | Gateway Down / Keys Missing | HTTP 503 error; **zero fake orders created**. | HTTP 503: `Payment processing undergoing maintenance`. | **PASS** |

---

## 3. WEBHOOK VULNERABILITY ANALYSIS & IDEMPOTENCY LOCK

### Vulnerability: Check-Then-Act Concurrency Race
In commit `de9ea70`, `api/webhook.js` checked:
```javascript
const { data: existingOrder } = await supabase
  .from('orders')
  .select('id')
  .eq('stripe_session_id', session.id)
  .maybeSingle();
```
Under concurrent arrival of duplicate webhooks (which occurs when Stripe's initial HTTP connection experiences jitter), two function invocations can execute simultaneously:
1. Thread A checks `orders` -> Not found.
2. Thread B checks `orders` -> Not found.
3. Thread A inserts `orders` and deducts inventory.
4. Thread B inserts `orders` -> Unique constraint fails, but if stock deduction runs concurrently, inventory is decremented twice!

### Remediation: Distributed PostgreSQL Lock
We must acquire an atomic lock by inserting into `webhook_events` **first**:
```sql
INSERT INTO webhook_events (id, event_type, processed_at)
VALUES (event.id, event.type, NOW());
```
If PostgreSQL returns error `23505` (unique violation), the webhook handler immediately logs `Duplicate event ${event.id} suppressed` and exits with HTTP 200 `{ received: true, message: 'Event already processed or in progress' }`.

---

## 4. SELF-HEALING RECONCILIATION ARCHITECTURE

### The Problem
If Supabase is briefly restarting during Stripe's webhook delivery:
1. Customer's credit card is charged $100.00.
2. Stripe's webhook returns HTTP 500 (waiting for exponential retry in 1 hour).
3. Customer is redirected immediately to `shop.html?order=success&session_id=cs_...`.
4. Previously, `/api/verify-session.js` saw that no order existed in Supabase, invented a mock ID `ODH-REC-...`, and returned success. The customer left, and no order existed in the database!

### The Self-Healing Fix
`/api/verify-session.js` must execute **Lazy Reconciliation**:
1. When `session.payment_status === 'paid'`, query `orders` by `stripe_session_id`.
2. If the order exists, return it immediately.
3. If the order **does not exist**, `/api/verify-session.js` takes authoritative session metadata, creates the order in Supabase, atomically deducts inventory, records the event, and returns the real, persistent Order ID!

This guarantees that **no customer payment can ever be orphaned**, regardless of whether webhooks are delayed, firewalled, or temporarily failing.
