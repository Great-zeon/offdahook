# OFF DA HOOK — WEBHOOK & PAYMENT RECOVERY CERTIFICATION
**Endpoint:** `POST https://offdahook.vercel.app/api/webhook`  
**Provider:** Stripe Hosted Checkout Webhook Events  
**Evaluation Standard:** Zero Unverified Payloads, Distributed Idempotency, and Failure Recovery  
**Auditor:** Independent Payment Reliability Systems Auditor  
**Date:** November 11, 2026

---

## 1. STRIPE SIGNATURE VERIFICATION & RAW BODY HANDLING

### 1.1 The Vercel Serverless Buffer Requirement
In Node.js serverless functions hosted on Vercel, incoming HTTP request bodies are parsed into JSON objects by default. However, cryptographic verification via `stripe.webhooks.constructEvent(payload, header, secret)` requires the **verbatim, unparsed byte buffer** of the incoming payload. If the JSON is re-serialized, whitespace differences invalidate the HMAC-SHA256 signature.

### 1.2 Verification of `api/webhook.js` Implementation
1. **Body Parser Disabled:**
   Lines 305-312:
   ```javascript
   handler.config = {
     api: {
       bodyParser: false
     }
   };
   ```
   Vercel preserves the raw HTTP stream.
2. **Stream Chunk Buffering:**
   Lines 26-34:
   ```javascript
   function getRawBody(req) {
     return new Promise((resolve, reject) => {
       const chunks = [];
       req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
       req.on('end', () => resolve(Buffer.concat(chunks)));
       req.on('error', err => reject(err));
     });
   }
   ```
3. **Mandatory Signature Verification:**
   Lines 73-82:
   ```javascript
   const rawBody = await getRawBody(req);
   event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
   ```
   If `stripe-signature` is missing or invalid, or if `STRIPE_WEBHOOK_SECRET` is unset, the handler immediately returns `HTTP 400 Bad Request`. **Zero unverified payloads are processed.**

---

## 2. WEBHOOK IDEMPOTENCY & CRASH-WINDOW RECOVERY

### 2.1 The Distributed Event Lock
When Stripe delivers a `checkout.session.completed` event:
* The event payload is passed to PostgreSQL procedure `process_paid_order_atomic`.
* Step 1 attempts to insert `event.id` (e.g. `evt_1QXXXXX`) into `webhook_events`.
* Because `webhook_events.id` is the primary key:
  - If the event is currently being processed or was processed previously, PostgreSQL raises a `unique_violation` exception.
  - The procedure returns `{"success": false, "duplicate": true}`.
  - `api/webhook.js` returns `HTTP 200 { received: true, message: 'Event already processed' }`.
  - Inventory is NOT decremented a second time.

### 2.2 The Crash-Window Failure Analysis
The adversarial audit evaluated what happens if the serverless function crashes midway:
* **Case A: Database connection drops before procedure completes:**
  - In PostgreSQL, the entire subtransaction rolls back to the savepoint.
  - The entry in `webhook_events` is **rolled back**.
  - `api/webhook.js` catches the error and returns `HTTP 500`.
  - Stripe's automated retry protocol (retrying at 1h, 2h, 4h, etc.) re-delivers the event.
  - The retry succeeds cleanly because the event ID was rolled back and is not locked as processed.
* **Case B: Order created, but Resend email dispatch fails:**
  - Order creation and inventory deduction are already committed to PostgreSQL.
  - `sendEmailNotification` catches the email error without throwing, logs the error, and leaves `orders.email_receipt_sent = FALSE`.
  - The webhook returns `HTTP 200` to Stripe. The customer was charged, the order exists in the dashboard, inventory was deducted, and Shawnese can trigger a manual "Resend Receipt" from `admin.html`.

---

## 3. SUPPORTED STRIPE EVENT TYPES

| Stripe Event Type | Processing Action | Output State |
| :--- | :--- | :--- |
| `checkout.session.completed` | Verifies `payment_status === 'paid'`. Executes `process_paid_order_atomic`. Sends receipt & merchant alert. | Order saved; stock deducted; HTTP 200. |
| `charge.refunded` | Handled or logged for audit trail. | Acknowledged HTTP 200. |
| Unsupported / Other Events | Safely ignored with HTTP 200. | Acknowledged without side effects. |

### Verification Verdict
**APPROVED.** The webhook architecture enforces strict HMAC signature verification, prevents duplicate stock deductions under concurrency, and recovers safely under transient network errors.
