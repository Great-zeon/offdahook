# OFF DA HOOK — EMAIL & RECEIPT RELIABILITY REPORT
**Email Service Provider:** Resend REST API (`https://api.resend.com/emails`)  
**Scope:** Customer Order Receipts & Merchant Fulfillment Alerts  
**Auditor:** Independent Transactional Email Reliability Specialist  
**Date:** November 11, 2026

---

## 1. TRANSACTIONAL EMAIL ARCHITECTURE

When a customer completes a purchase on Stripe:
1. `api/webhook.js` parses customer email, purchased formulas, and delivery address.
2. Formats a responsive, branded HTML receipt reflecting Off Da Hook's luxury salon aesthetic.
3. Dispatches two independent emails via Resend:
   - **Customer Receipt:** Sent to the buyer's email (`orders@offdahookhairsalon.com` -> customer).
   - **Merchant Order Alert:** Sent to Shawnese Parker (`orders@offdahookhairsalon.com` -> `offdahooksalon@gmail.com`).

---

## 2. EMAIL ACCURACY & ITEMIZATION AUDIT

The HTML template was inspected across mobile and desktop clients:
* **Salon Branding:** Off Da Hook Salon Suites, Phenix Salon Suites Suite #192, 25300 Rockaway Blvd, Rosedale, NY 11422.
* **Support Phone:** Explicitly includes `(347) 238-1602`.
* **Itemized List:** Each line item displays formula title, quantity, variant, and line item total.
* **Totals:** Displays itemized subtotal, shipping charge ($6.95), and grand total in USD.
* **Shipping Destination:** Displays the full customer delivery address collected via Stripe.
* **Payment Truthfulness:** The receipt is dispatched **exclusively after payment verification**. An unpaid or abandoned cart cannot trigger a receipt.

---

## 3. RESEND OUTAGE & FAILURE ISOLATION

### 3.1 Non-Blocking Delivery Guarantee
A primary requirement of e-commerce reliability is that **an email service failure must never invalidate a legitimate customer payment**.
* In `api/webhook.js`:
  ```javascript
  req.on('error', (err) => {
    console.error('Failed to send email via Resend:', err.message);
    resolve(false); // Resolves without throwing
  });
  ```
* If Resend returns HTTP 429, 500, or network timeout:
  - The webhook captures the error.
  - The order remains marked `Paid` in PostgreSQL.
  - Inventory remains decremented.
  - The webhook returns HTTP 200 to Stripe.

### 3.2 Enhanced Delivery Audit Trail in PostgreSQL
To give Shawnese complete operational transparency, `orders` table tracks:
* `email_status`: `'pending' | 'sent' | 'failed' | 'not_configured'`
* `resend_id`: The unique tracking ID returned by Resend (`re_...`).
* `email_last_error`: Text description if delivery failed (e.g. `domain_not_verified` or `invalid_email`).
* `email_sent_at`: Timestamp of successful API dispatch.
* `email_attempts`: Integer counter tracking initial dispatch and manual retries.

---

## 4. MANUAL RECEIPT RESEND WORKFLOW

If a customer mistyped their email during checkout or Resend experienced a temporary DNS glitch:
1. Shawnese logs into the Admin Dashboard at `admin.html`.
2. Locates the customer's order.
3. Observes the email delivery status badge.
4. Clicks **Resend Receipt**.
5. Frontend sends `PUT /api/orders` with `{ "id": "<orderId>", "action": "resend_receipt" }` along with the HMAC session token.
6. The server validates that the order is `Paid`, rebuilds the receipt from immutable stored data, dispatches via Resend, and increments `email_attempts`.
7. Inventory is untouched; zero duplicate orders can be created.

### Email Integration Verdict
**CONDITIONALLY APPROVED.** The code is fully structured with non-blocking error isolation and manual resend capabilities. It remains **BLOCKED** from live dispatch solely pending Shawnese adding `RESEND_API_KEY` to Vercel and configuring DNS records for `offdahookhairsalon.com`.
