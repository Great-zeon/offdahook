# OFF DA HOOK SALON SUITES — SECOND-ROUND AUTOMATED TEST RESULTS
**Execution Date:** November 11, 2026  
**Test Suite:** `test_payment_integrity_suite.py`  
**Execution Runtime:** `/usr/bin/python3`  
**Total Tests:** 30  
**Passed:** 30  
**Failed:** 0  
**Status:** **100% PASS**  

---

## 1. Test Execution Console Output

```
======================================================================
RUNNING OFF DA HOOK 30-SCENARIO AUTOMATED REGRESSION TEST SUITE
======================================================================
[PASS] TC-01: Negative quantity with positive quantity (net +3)
[PASS] TC-02: Item with missing quantity field
[PASS] TC-03: Item with null quantity
[PASS] TC-04: Item with non-integer decimal quantity (2.5)
[PASS] TC-05: Quantity exceeding 10000 threshold
[PASS] TC-06: Duplicate order ID with different Stripe session
[PASS] TC-07: Duplicate Stripe session with different event ID
[PASS] TC-08: Concurrent identical webhook event within 30s
[PASS] TC-09: Multi-product lock ordering (Alphabetical deadlock prevention)
[PASS] TC-10: Stale in-flight event (>30s) allowed to resume processing
[PASS] TC-11: Independent stored procedure for durable failure logging
[PASS] TC-12: Retry after transaction marked failed
[PASS] TC-13: Session missing currency field
[PASS] TC-14: Session with currency 'eur'
[PASS] TC-15: Verify-session enforces shared currency validation
[PASS] TC-16: Negative amount_total (-100)
[PASS] TC-17: Malformed non-JSON itemsJson metadata
[PASS] TC-18: Webhook handles checkout.session.async_payment_succeeded
[PASS] TC-19: Webhook handles checkout.session.async_payment_failed
[PASS] TC-20: Merchant notification dispatched when customer email is empty
[PASS] TC-21: Orders table has merchant alert failure tracking columns
[PASS] TC-22: Orders table has customer receipt failure tracking columns
[PASS] TC-23: Duplicate webhook returns 200 before reaching email dispatch
[PASS] TC-24: HTML escaping of untrusted customer and product strings
[PASS] TC-25: Safe repeatable unique index migration for stripe_session_id
[PASS] TC-26: Migration checks for duplicate existing session IDs before indexing
[PASS] TC-27: Verify-session masks session ID and customer email
[PASS] TC-28: Verify-session correctly conveys Backordered_Action_Required status
[PASS] TC-29: Shortfall aborts stock deduction for all items before loop
[PASS] TC-30: Reconciliation captures duplicate and retrieves existing order
======================================================================
AUTOMATED TEST RESULTS: 30 PASSED / 30 EXECUTED
======================================================================
ALL 30 VERIFIED SCENARIOS PASSED WITH ZERO FAILURES.
```

---

## 2. Categorized Scenario Matrix

| ID | Category | Scenario Description | Expected Outcome | Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Item Validation | Cart contains `[{qty: 5}, {qty: -2}]` | Rejected before stock aggregation | **PASS** |
| **TC-02** | Item Validation | Item missing `qty` property | Rejected by regex check | **PASS** |
| **TC-03** | Item Validation | Item with `qty: null` | Rejected by null assertion | **PASS** |
| **TC-04** | Item Validation | Item with float `qty: 2.5` | Rejected by integer regex `^\d+$` | **PASS** |
| **TC-05** | Item Validation | Item with `qty: 10001` | Rejected by 10,000 threshold check | **PASS** |
| **TC-06** | DB Exception | Order ID collision with novel Stripe session | Handled as DB error, NOT duplicate | **PASS** |
| **TC-07** | Idempotency | Same Stripe session sent with new event ID | Handled as duplicate, returns HTTP 200 | **PASS** |
| **TC-08** | Idempotency | Identical webhook event within 30s | Returns HTTP 200 (in-flight skip) | **PASS** |
| **TC-09** | Concurrency | Concurrent checkouts with opposite product ordering | Alphabetical locking prevents deadlock | **PASS** |
| **TC-10** | Recovery | Stale in-flight event older than 30s | Allowed to resume processing | **PASS** |
| **TC-11** | Failure Logging | Independent failure tracking procedure | `record_webhook_failure` persists outside tx | **PASS** |
| **TC-12** | Recovery | Retry after previous attempt marked failed | Allows reprocessing on subsequent event | **PASS** |
| **TC-13** | Payment Check | Checkout session missing currency | Rejection via `validateStripeSession` | **PASS** |
| **TC-14** | Payment Check | Checkout session with `currency: 'eur'` | Rejection via `validateStripeSession` | **PASS** |
| **TC-15** | Parity | `verify-session.js` imports shared validation | Parity guaranteed between handlers | **PASS** |
| **TC-16** | Payment Check | Negative `amount_total: -100` | Rejection via `validateStripeSession` | **PASS** |
| **TC-17** | Payment Check | Malformed JSON in `itemsJson` metadata | Rejection via `validateStripeSession` | **PASS** |
| **TC-18** | Event Lifecycle | `checkout.session.async_payment_succeeded` | Processed through atomic order procedure | **PASS** |
| **TC-19** | Event Lifecycle | `checkout.session.async_payment_failed` | Marked failed in `webhook_events`, no order | **PASS** |
| **TC-20** | Notification | Customer email empty string or missing | Merchant notification dispatched unconditionally | **PASS** |
| **TC-21** | Notification | `orders` table tracks merchant alert status | Schema contains tracking columns | **PASS** |
| **TC-22** | Notification | `orders` table tracks customer receipt status | Schema contains tracking columns | **PASS** |
| **TC-23** | Email Isolation | Webhook duplicate event | Bypasses email dispatch entirely | **PASS** |
| **TC-24** | Security | Untrusted customer input rendered in HTML | Sanitized via `escapeHtml` | **PASS** |
| **TC-25** | DB Migration | Unique index on `orders.stripe_session_id` | Repeatable migration block in schema | **PASS** |
| **TC-26** | DB Migration | Pre-flight duplicate check before index | Disambiguates historical collisions | **PASS** |
| **TC-27** | Privacy | `verify-session.js` response payload | Truncates session ID, masks email | **PASS** |
| **TC-28** | Status Integrity | Verification of backordered order | Accurately returns backorder status | **PASS** |
| **TC-29** | Inventory | Inventory shortfall during atomic execution | Aborts stock deduction before loop | **PASS** |
| **TC-30** | Reconciliation | Self-healing duplicate handling in verify-session | Retrieves authoritative order on collision | **PASS** |
