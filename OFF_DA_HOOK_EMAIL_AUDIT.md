# Off Da Hook Salon Suites — Transactional Email & Messaging Audit
**Date**: November 11, 2026  
**Auditor**: Lead Communications & QA Architect  
**Subsystem**: Resend REST API, Receipt Templates, Merchant Notification Alerts  
**Status**: AUDITED & CERTIFIED  

---

## 1. Email Templates & Styling

1. **Customer Order Receipt**:
   - Sent to `customerEmail` upon successful order processing.
   - Luxury branded dark theme matching Off Da Hook brand identity:
     - Header: "OFF DA HOOK SALON SUITES • Rosedale, NY • Phenix Salon Suites Suite #192"
     - Title: "Crown Order Confirmed: ODH-YYYYMMDD-XXXX"
     - Body: Personalized greeting, itemized formula table with quantities and subtotals, total amount paid in USD, and shipping address destination.
     - Salon Concierge footer with direct phone line `(347) 238-1602`.
2. **Merchant Fulfillment Alert**:
   - Dispatched to `MERCHANT_ALERT_EMAIL` (default: `offdahooksalon@gmail.com`).
   - Alerts Shawnese to new orders with customer contact details, shipping destination, itemized product list for packing, and a direct button to open `admin.html`.
3. **Inventory Shortfall Alert**:
   - Dispatched immediately if a paid checkout encounters out-of-stock items.
   - Clearly flags order ID, customer details, and shortfall breakdown so the merchant can fulfill or issue a partial refund.

---

## 2. Reliability & Delivery Lifecycle

1. **Isolation from Payment Transactions**:
   - Email dispatch errors (network timeout, invalid email, Resend API key issues) are caught gracefully.
   - A failure to send an email **never rolls back a paid order** and **never repeats inventory deductions**.
2. **Delivery Audit Columns in `orders`**:
   - `email_status`: `'pending'`, `'sent'`, `'failed'`.
   - `resend_id`: Captured from Resend JSON response `{ "id": "re_..." }`.
   - `email_sent_at`: Timestamp of successful dispatch.
   - `email_attempts`: Count of dispatch attempts.
   - `email_last_error`: Text of error if dispatch fails.

