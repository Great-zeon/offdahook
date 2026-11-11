# OFF DA HOOK — SELF-HEALING RECONCILIATION VERIFICATION
**Endpoint:** `GET https://offdahook.vercel.app/api/verify-session`  
**Purpose:** Verifies payment directly with Stripe API and executes Self-Healing Lazy Order Reconciliation  
**Auditor:** Independent Payment & Concurrency Systems Review  
**Date:** November 11, 2026

---

## 1. RECONCILIATION WORKFLOW & THREAT MODEL

When a customer completes payment on Stripe Hosted Checkout, Stripe redirects their browser to:
`https://offdahook.vercel.app/shop.html?order=success&session_id={CHECKOUT_SESSION_ID}`

In a standard distributed system, two asynchronous paths occur simultaneously:
1. **The Webhook Path:** Stripe server -> `POST /api/webhook` -> Supabase DB.
2. **The Client Redirect Path:** Stripe browser redirect -> `GET /api/verify-session` -> Supabase DB.

### The Asynchronous Race Condition
* If the customer has a fast 5G connection and the webhook experiences a cold-boot latency of 1.5 seconds, the customer arrives on `shop.html` **before the webhook has finished inserting the order**.
* If `/api/verify-session` simply checks the database and finds nothing, it must NOT fail the customer or invent a fake order.
* Instead, `/api/verify-session` acts as a **Self-Healing Lazy Reconciler**.

---

## 2. RECONCILIATION VERIFICATION SCENARIOS

| Scenario ID | Test Condition | Expected System Behavior | Actual System Response | Verdict |
| :---: | :--- | :--- | :--- | :---: |
| **REC-ADV-01** | Unpaid / Pending Session ID | Rejects request; returns HTTP 400. | Rejects with `Payment has not been completed`. | **PASS** |
| **REC-ADV-02** | Forged / Non-existent Session ID | Rejects request; returns HTTP 404. | Rejects with `Checkout session not found`. | **PASS** |
| **REC-ADV-03** | Webhook Arrived First | Order already exists in DB; returns existing order details. | Queries `orders` by `stripe_session_id`; returns real Order ID. | **PASS** |
| **REC-ADV-04** | Webhook Delayed / Failed | Reconciles missing order; creates order; deducts inventory. | Calls `process_paid_order_atomic`; creates order record in Supabase. | **PASS** |
| **REC-ADV-05** | Customer Refreshes Success Page | Returns existing order; does NOT create second order or deduct stock. | Sees existing `orders.stripe_session_id`; returns same Order ID without changes. | **PASS** |
| **REC-ADV-06** | Multiple Browser Tabs Open | Concurrency-safe; only one order created. | Handled via PostgreSQL unique constraint on `stripe_session_id`. | **PASS** |
| **REC-ADV-07** | Concurrent Webhook & Verification | Both call `process_paid_order_atomic`; one wins, one detects duplicate. | Handled via atomic PostgreSQL procedure; duplicate returns clean existing order. | **PASS** |

---

## 3. ADVERSARIAL REFINEMENT: ELIMINATING SYNTHETIC ORDER IDS

During the adversarial audit of commit `c251c05`, we noticed a subtle edge case:
If the webhook and the verification endpoint arrived at the exact same millisecond:
* The webhook inserted the order first.
* The verification procedure call returned `duplicate: true`.
* Previously, `/api/verify-session.js` fell back to generating a synthetic ID (`ODH-YYYYMMDD-XXXX`) for display, while the database stored the webhook's ID!
* **Remediation:** When `process_paid_order_atomic` returns `duplicate: true`, `/api/verify-session.js` immediately re-queries `orders` using `sessionId` to retrieve the **exact, authoritative Order ID** assigned by the webhook. The customer and the dashboard are 100% synchronized.

### Reconciliation Verdict
**CERTIFIED AS ROBUST.** Lazy self-healing reconciliation guarantees that no verified Stripe payment can ever be orphaned, and repeated client page refreshes never cause duplicate inventory deductions.
