# Off Da Hook Salon Suites — Notification Delivery Report
**Date:** November 12, 2026  
**Scope:** [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js), [`api/notifications-retry.js`](file:///Users/macos/Downloads/offdahook/api/notifications-retry.js), [`api/resend-webhook.js`](file:///Users/macos/Downloads/offdahook/api/resend-webhook.js), `order_notifications` DDL  

---

## 1. Outbox Lifecycle & Race Protection

1. **Transactional Queuing**: `order_notifications` rows (`merchant_order_alert`, `customer_order_receipt`, `merchant_shortfall_alert`, `customer_backorder_notice`) are inserted inside the same atomic PostgreSQL transaction (`process_paid_order_atomic`) as the order record. Merchant alerts are created regardless of customer email presence (`TC-14`, `TC-15`, `TC-16`).
2. **Atomic Lease Claiming & Stale Crash Recovery**:
   - [`claim_pending_notifications`](file:///Users/macos/Downloads/offdahook/schema.sql#L783-L819) uses PostgreSQL `FOR UPDATE SKIP LOCKED` to atomically claim `queued`, due `retrying`, and expired `processing` rows (`last_attempt_at <= NOW() - INTERVAL '60 seconds'`).
   - Prevents concurrent workers from double-sending emails (`TC-58`, `TC-64`).
3. **Provider Acceptance vs. True Delivery**:
   - Resend API HTTP 200 acceptance sets status to **`accepted`** (distinct from `delivered`) and supplies `Idempotency-Key: notif-<id>-attempt-<n>`.
   - Outbound Resend requests apply a strict **10-second timeout** (`EMAIL_TIMEOUT_MS = 10000`).
4. **Resend Delivery Webhooks (`api/resend-webhook.js`)**:
   - Verifies Svix HMAC-SHA256 signatures + 5-minute replay tolerance (`RESEND_WEBHOOK_SECRET`).
   - Processes `email.delivered` (`-> delivered`), `email.bounced` (`-> bounced`), `email.complained` (`-> complained`), and `email.delivery_delayed` (`-> delayed`), keeping `orders` notification columns accurate (`TC-60`).
5. **Protected Manual/Cron Retry (`api/notifications-retry.js`)**:
   - Requires verified admin bearer token (`verifyToken(token, masterPin)`) or timing-safe `x-cron-secret`.

---

## 2. Live Provider Verification Status

| Check | Status | Blocking Dependency |
| :--- | :---: | :--- |
| Outbox schema, atomic claim RPC, timeout & Svix webhook verification (`TC-14`..`17`, `TC-45`, `TC-51`..`53`, `TC-60`, `TC-64`) | **PASS** (Static / Simulated) | None |
| Live Resend API Acceptance & Inbox Delivery (`offdahookhairsalon.com` SPF/DKIM) | **BLOCKED** | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and live DNS verification |
