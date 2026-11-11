# OFF DA HOOK SALON SUITES — PAYMENT VALIDATION REPORT
**Generated:** November 11, 2026  
**Module:** `api/_payment-validation.js`, `api/webhook.js`, `api/verify-session.js`, `api/checkout.js`  
**Standard:** Strict Payment Boundary & Input Sanitization Architecture  

---

## 1. Overview & Validation Architecture

Prior to this remediation, `api/webhook.js` and `api/verify-session.js` maintained separate, drifting validation routines. This introduced risks of divergence where client verification could approve transactions that webhook processing rejected or vice-versa.

In this round, we unified all payment validation rules into a single source of truth: `api/_payment-validation.js`.

---

## 2. Core Validation Rules & Boundaries

### 2.1 Currency Enforcement
- **Rule**: Currency must be strictly `'usd'` (case-insensitive string match converted to lower-case).
- **Enforcement**: If `session.currency?.toLowerCase() !== 'usd'`, validation throws `Error("Invalid currency: expected 'usd', received '...'")`.
- **Mitigation**: Prevents foreign exchange arbitrage or zero-decimal currency exploits.

### 2.2 Payment Amount Bounds
- **Minimum Bound**: `$1.00` (`100` cents). Zero-dollar or sub-dollar test charges are rejected.
- **Maximum Bound**: `$10,000.00` (`1,000,000` cents). High-dollar fraud or runaway calculation errors are rejected.
- **Integer Type Check**: Amount must satisfy `Number.isInteger(session.amount_total) && session.amount_total > 0`. Float fractions or negative quantities are rejected.

### 2.3 Cart Metadata & Item Pre-Validation
Metadata stored on the Stripe Checkout Session (`session.metadata.itemsJson` or `session.metadata.cart`) is rigorously unpacked and validated:
- Must parse as valid JSON array.
- Must not be empty (`items.length > 0`).
- Every individual item is validated:
  - `id`: Must be a non-empty string.
  - `qty`: Must be an integer (`Number.isInteger(item.qty)`), greater than `0`, and less than or equal to `10,000`.
  - `price`: Must be a non-negative number if supplied.
  - `title`: Must be a non-empty string.

### 2.4 Stripe Payment Event Matrix
- `checkout.session.completed`: Processed when `payment_status === 'paid'`.
- `checkout.session.async_payment_succeeded`: Processed when delayed payment (e.g. ACH/Klarna) transitions to paid.
- `checkout.session.async_payment_failed`: Logged to `webhook_events` with status `'failed'`, triggering no order insertion or stock deduction.

---

## 3. Parity Matrix Between Handlers

| Validation Rule | `api/webhook.js` | `api/verify-session.js` | Status |
| :--- | :--- | :--- | :--- |
| **Strict USD Check** | Enforced via `validateStripeSession` | Enforced via `validateStripeSession` | **IDENTICAL** |
| **$1.00 - $10,000.00 Range** | Enforced via `validateStripeSession` | Enforced via `validateStripeSession` | **IDENTICAL** |
| **Positive Integer Cents** | Enforced via `validateStripeSession` | Enforced via `validateStripeSession` | **IDENTICAL** |
| **Item Qty 1..10000** | Enforced via `validateStripeSession` | Enforced via `validateStripeSession` | **IDENTICAL** |
| **JSON Metadata Parsing** | Enforced via `validateStripeSession` | Enforced via `validateStripeSession` | **IDENTICAL** |
| **HTML Sanitization** | Applied to emails via `escapeHtml` | Applied to outputs via `escapeHtml` | **IDENTICAL** |
| **Customer Privacy Masking** | Masked in logs | Email & session ref masked in response | **ALIGNED** |

---

## 4. Test Verification

Automated test cases covering payment validation in `test_payment_integrity_suite.py`:
- `TC-01`: Negative quantity with positive quantity in cart (`PASS`)
- `TC-02`: Item with missing quantity field (`PASS`)
- `TC-03`: Item with null quantity (`PASS`)
- `TC-04`: Item with non-integer decimal quantity (`PASS`)
- `TC-05`: Quantity exceeding 10,000 threshold (`PASS`)
- `TC-13`: Session missing currency field (`PASS`)
- `TC-14`: Session with currency `'eur'` (`PASS`)
- `TC-15`: Verify-session enforces shared currency validation (`PASS`)
- `TC-16`: Negative amount_total (`PASS`)
- `TC-17`: Malformed non-JSON itemsJson metadata (`PASS`)
- `TC-18`: Webhook handles `async_payment_succeeded` (`PASS`)
- `TC-19`: Webhook handles `async_payment_failed` (`PASS`)
