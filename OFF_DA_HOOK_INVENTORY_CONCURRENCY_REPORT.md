# Off Da Hook Salon Suites — Inventory & Concurrency Report
**Date:** November 12, 2026  
**Scope:** `process_paid_order_atomic`, `claim_pending_notifications`, `api/webhook.js`  

---

## 1. Concurrency Controls Verified in Code

1. **Product Catalog & Eligibility Guard**: Rejects unknown (`IF NOT FOUND`) and inactive (`is_active = FALSE`) items before any order insert or stock modification (`TC-02`–`TC-05`, `TC-39`).
2. **Deterministic Alphabetical Row Locking**: Aggregated cart IDs are locked in ascending `ORDER BY x.id ASC` order (`FOR UPDATE`), preventing multi-product cyclic deadlocks (`TC-11`).
3. **In-Flight Lease Guarantee**:
   - Event lock queries `webhook_events` with `FOR UPDATE`.
   - Active leases (<30s) and `webhook_events_pkey` race collisions without a committed order return `{ in_flight: true, duplicate: false, order_id: null }` (`TC-08`, `TC-58`).
   - `api/webhook.js` responds with **HTTP 503** + `Retry-After: 5` (`TC-42`).
   - Leases >30s are cleanly reclaimed (`TC-09`).
4. **Atomic Stock Shortfall Defense**: If any tracked product (`track_inventory = TRUE`) has insufficient stock, stock deduction is aborted for ALL items, and the order persists as `'Backordered_Action_Required'` (`TC-16`, `TC-54` simulation).

---

## 2. Evidence Distinction

| Test Type | Outcome | Scope Note |
| :--- | :---: | :--- |
| Simulated Concurrency & DB Logic Tests (`TC-02`..`09`, `TC-36`, `TC-54`) | **PASS** | Validated in Python multi-threaded & PL/pgSQL logic simulator (`test_payment_integrity_suite.py`). |
| Real PostgreSQL Server Concurrency (`FOR UPDATE` contention across HTTP workers) | **BLOCKED** | Cannot execute without a live staging PostgreSQL instance and deployed Vercel staging API. |

