# Off Da Hook Salon Suites — Payment Security Audit
**Date**: November 11, 2026  
**Auditor**: Lead Financial Security Architect  
**Scope**: Checkout Session Creation, Stripe Webhook Handling, Payment Verification, Idempotency  
**Status**: AUDITED & CERTIFIED  

---

## 1. Checkout Session Creation Security (`api/checkout.js`)

1. **Client Price Tampering Immunity**:
   - The browser sends product ID and quantity only.
   - Prices are resolved server-side from PostgreSQL (`products` table). Client-modified prices are ignored.
2. **Catalog Validation**:
   - Rejects non-existent, inactive, or malformed items.
   - Rejects zero, negative, or non-integer quantities.
   - Checks available inventory before generating the checkout session.
3. **Session Configuration**:
   - Collects customer shipping address restricted to US destinations.
   - Enforces $6.95 Standard Priority Shipping.
   - Serializes cart metadata (`itemsJson`) server-side for downstream webhook processing.

---

## 2. Webhook Security & Idempotency (`api/webhook.js`)

1. **Cryptographic Signature Verification**:
   - Uses `stripe.webhooks.constructEvent` with the raw unparsed request buffer.
   - Signature verification failure immediately aborts processing with HTTP 400.
2. **Pre-Fulfillment Guards**:
   - Verifies `session.payment_status === 'paid'`.
   - Verifies `session.currency === 'usd'`.
   - Verifies `session.amount_total > 0`.
3. **Elimination of Non-Atomic Fallback**:
   - The previous sequential fallback has been removed.
   - All order creation and stock deductions pass through `process_paid_order_atomic`.
   - If the database is temporarily unreachable, returns HTTP 500 so Stripe automatically retries.
4. **Idempotency Protection**:
   - Enforces unique constraints on `stripe_session_id` and `webhook_events.id`.
   - Duplicate deliveries return HTTP 200 without re-executing order creation or stock deductions.

---

## 3. Post-Payment Session Verification (`api/verify-session.js`)

1. **Direct Gateway Verification**:
   - Queries Stripe API directly using the session ID.
   - Rejects unpaid, expired, or declined sessions.
2. **Zero Synthetic Order IDs**:
   - Never manufactures fake `ODH-...` IDs.
   - If the order has not yet been persisted by the webhook, returns `order_persisted: false, status: 'payment_verified_order_pending'`.
3. **Privacy Protection**:
   - Enforces session ID format regex (`^cs_(test|live)_[a-zA-Z0-9]+$`).
   - Masks customer email (`s***e@gmail.com`).
   - Omits customer phone and street address from response.
   - Enforces `Cache-Control: no-store`.
