# OFF DA HOOK SALON SUITES — NOTIFICATION RELIABILITY REPORT
**Generated:** November 11, 2026  
**Module:** `api/webhook.js`, `api/_payment-validation.js`, `schema.sql`  
**Focus:** Merchant Alert Independence, Customer Delivery Isolation, and Template XSS Protection  

---

## 1. Decoupled Merchant Notification Dispatch

### The Problem in Earlier Revisions
In prior iterations, merchant email notifications to salon owner Shawnese Parker were structurally nested within the customer email processing block (`if (customerEmail) { ... }`).
If a customer checked out without providing an email address, or if customer email delivery threw an exception, the merchant alert was silently suppressed. The merchant would have no awareness of a paid order requiring shipment.

### The Remediation
In `api/webhook.js`, the notification sequence has been completely decoupled:
1. **Merchant Alert Runs Unconditionally**: The merchant email dispatch executes independently of whether `customerEmail` is present or missing.
2. **Dedicated Error Handling**: A failure in sending the customer email cannot abort or skip the merchant alert.
3. **Database Audit Tracking**:
   - `merchant_alert_status` (`'sent'`, `'failed'`, or `'pending'`)
   - `merchant_alert_error` (string error message if Resend API rejects)
   - `customer_receipt_status` (`'sent'`, `'failed'`, `'missing_email'`)
   - `customer_receipt_error` (string error message if Resend API rejects)

```javascript
// Decoupled Merchant Dispatch in api/webhook.js
if (resend) {
  // 1. Unconditional Merchant Notification
  try {
    const merchantResult = await resend.emails.send({
      from: 'Off Da Hook Orders <orders@offdahookhairsalon.com>',
      to: ['shawnese@offdahookhairsalon.com', 'orders@offdahookhairsalon.com'],
      subject: `🚨 Paid Order Alert: #${orderId} ($${(amountTotal / 100).toFixed(2)})`,
      html: buildMerchantEmailHtml(...)
    });
    // Log success in orders table
  } catch (mErr) {
    // Record merchant_alert_status = 'failed' in database
  }

  // 2. Isolated Customer Confirmation
  if (customerEmail) {
    try {
      const customerResult = await resend.emails.send({
        from: 'Off Da Hook Salon Suites <orders@offdahookhairsalon.com>',
        to: [customerEmail],
        subject: `Your Off Da Hook Order #${orderId} is Confirmed!`,
        html: buildCustomerEmailHtml(...)
      });
      // Log success in orders table
    } catch (cErr) {
      // Record customer_receipt_status = 'failed' in database
    }
  } else {
    // Record customer_receipt_status = 'missing_email'
  }
}
```

---

## 2. Protection Against HTML Injection in Transactional Emails

Customer-submitted data (customer name, shipping address lines, customer notes, special instructions) and product titles are rendered into HTML email templates. If unescaped, malicious input could inject rogue HTML or phishing links into emails received by the merchant or customer.

### HTML Entity Escaping Function
All variables injected into email templates are passed through `escapeHtml()`:
```javascript
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### Template Applications
- Customer Name: `escapeHtml(customerDetails?.name || 'Valued Customer')`
- Shipping Address: `escapeHtml(shippingDetails?.address?.line1)`
- Product Titles: `escapeHtml(item.title)`
- Order Notes: `escapeHtml(session.metadata?.notes)`

---

## 3. Customer Privacy Minimization in Session Verification

In `api/verify-session.js`:
1. Customer email is masked: `maskEmail(customerEmail)` transforms `john.doe@example.com` into `j***e@example.com`.
2. Stripe session ID is truncated to a safe 8-character reference token: `session_ref: sessionId.slice(-8)`.
3. Client browser responses never leak full Stripe session keys, customer street addresses, or payment intent secrets.
4. Edge and proxy caches are explicitly disabled via `res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')`.
