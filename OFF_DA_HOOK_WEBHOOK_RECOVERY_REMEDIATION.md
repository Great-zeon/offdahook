# Off Da Hook Salon Suites — Webhook Recovery & Lifecycle Remediation
**Date**: November 11, 2026  
**Auditor**: Lead Systems & Security Architect  
**Subsystem**: Webhook Event Tracking & Distributed Locking (`webhook_events`)  
**Status**: REMEDIATED & CERTIFIED  

---

## 1. Webhook Event Lifecycle

To guarantee that duplicate deliveries do not duplicate business operations and that crashed operations remain retryable, the `webhook_events` schema and state machine have been upgraded.

### Table Definition
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT
);
```

### Lifecycle States
1. **`processing`**: Event record is inserted immediately upon webhook receipt. If a second worker attempts to process the same event within 30 seconds, it receives `{ "in_flight": true }` and returns HTTP 200 to prevent duplicate execution. If more than 30 seconds have elapsed (indicating worker crash/timeout), the retry increments `attempt_count` and resumes processing.
2. **`completed`**: The atomic transaction successfully created the persistent order and deducted inventory. Any subsequent webhook delivery detects `status = 'completed'` and immediately returns HTTP 200 with `{ "duplicate": true, "order_id": ... }`.
3. **`action_required`**: Stripe successfully collected funds, but an inventory shortfall occurred prior to fulfillment. Stock was not deducted; the order is marked `Backordered_Action_Required`, and the merchant was alerted.
4. **`failed`**: An unexpected exception aborted the transaction. PostgreSQL rolled back all intermediate modifications. The event record captures `last_error` and remains eligible for retry upon Stripe's next delivery attempt.

---

## 2. Idempotency Boundary Matrix

| Scenario | Webhook Input | DB State | Execution Path | Response to Stripe | Result |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **First Delivery** | Valid `checkout.session.completed` | No prior record | Full atomic deduction & order creation | `HTTP 200` (`{ orderId: 'ODH-...' }`) | Order created, stock deducted, receipt emailed. |
| **Duplicate Delivery** | Identical `event.id` | Event `status = 'completed'` | Short-circuits at step 2 | `HTTP 200` (`{ duplicate: true }`) | No re-execution, no double stock deduction. |
| **Alternate Event ID** | Different `event.id`, same `stripe_session_id` | Order already exists for session | Short-circuits at step 2 via `stripe_session_id` | `HTTP 200` (`{ duplicate: true }`) | Re-links event to order, prevents second order. |
| **Concurrent Workers** | Two deliveries within 50ms | Worker 1 acquires row lock | Worker 2 encounters in-flight state or duplicate catch | `HTTP 200` | Exactly one order created. |
| **Database Outage** | Valid delivery | Supabase offline | RPC call fails | `HTTP 500` | Stripe queues retry with exponential backoff. |

