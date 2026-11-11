# Off Da Hook Salon Suites — Transactional Email & Receipt Delivery Audit
**Date**: November 11, 2026  
**Auditor**: Lead Communications & Systems Architect  
**Subsystem**: Resend REST API, Receipt Generation, Merchant Fulfillment Alerts  
**Status**: AUDITED & HARDENED  

---

## 1. Separation of Concerns: Payment vs. Email Delivery

Under zero-trust e-commerce architecture:
1. **Financial Settlement & Inventory Are Primary**: If a payment is captured and an order is inserted, that transaction is legally binding and persistent.
2. **Email Delivery Is Asynchronous & Secondary**: A temporary failure of the email provider (e.g. Resend rate limit, DNS blip, invalid customer email) must **NEVER** abort or roll back a paid order, and must **NEVER** cause inventory to be deducted a second time.

---

## 2. Delivery State Tracking in Database Schema

The `orders` table tracks the full delivery lifecycle:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_receipt_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resend_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_last_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
```

### State Lifecycle
- **`pending`**: Order created; email dispatch queued.
- **`sent`**: Resend API accepted the message with HTTP 200/201 and returned a unique message ID (`resend_id`).
- **`failed`**: Resend API rejected the request or network failed. The error message is captured in `email_last_error`, and `email_attempts` is incremented.

---

## 3. Manual Resend Capability (`api/orders.js`)

In the administrative portal (`admin.html`), if an order displays `email_status: 'failed'` or if a customer calls the salon requesting a replacement receipt:
1. Shawnese or the administrator clicks **"Resend Receipt"**.
2. The browser sends `PUT /api/orders` with `action: 'resend_receipt'` authorized by the HMAC session token.
3. The server retrieves the immutable order record, renders the luxury branded HTML receipt, dispatches it to the customer via Resend, and increments `email_attempts`.
4. **Safety Guarantee**: The resend operation does NOT modify product stock or alter payment status.
