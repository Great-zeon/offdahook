# Off Da Hook Salon Suites — Payment Processing Remediation Report
**Date**: November 11, 2026  
**Auditor**: Lead Financial & Infrastructure QA Engineer  
**Component**: Stripe Checkout Creation, Webhook Processing, Payment Verification  
**Status**: REMEDIATED & CERTIFIED  

---

## 1. Checkout Creation & Server-Authoritative Integrity (`api/checkout.js`)

### A. Authoritative Catalog Verification
- The browser cart submits product IDs and requested quantities only.
- In `api/checkout.js`, prices are retrieved directly from Supabase PostgreSQL (`products` table) or local catalog.
- Client-submitted prices (e.g. tampering via DevTools to `$0.01`) are discarded.
- Available stock is checked prior to creating the Stripe Checkout session. If stock is lower than requested quantity, the API returns HTTP 400 with a localized salon alert:
  ```json
  {
    "success": false,
    "error": "Apologies! \"Loc Butta Sauce\" only has 2 unit(s) remaining in stock."
  }
  ```

### B. Fixed Shipping & Tax Enforcement
- Standard Priority Shipping ($6.95) is hardcoded server-side in the Stripe Session configuration.
- US shipping address collection is enforced (`allowed_countries: ['US']`).
- Phone number collection is enabled for courier delivery notifications.
- Sanitized item metadata (`id`, `title`, `qty`, `price`) is serialized into `session.metadata.itemsJson`.

---

## 2. Webhook Ingestion & Cryptographic Validation (`api/webhook.js`)

### A. Raw Body Preservation
- Vercel's automatic body parser is disabled (`handler.config = { api: { bodyParser: false } }`).
- Raw bytes are read from the incoming request stream via `getRawBody(req)`.
- `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)` verifies the HMAC-SHA256 signature against the raw payload. Replayed or forged webhooks are rejected with HTTP 400.

### B. Pre-Fulfillment Validation Guards
Before any database call is initiated, the webhook asserts:
1. `event.type === 'checkout.session.completed'`
2. `session.payment_status === 'paid'`: Defends against deferred/asynchronous payment methods where funds have not yet settled.
3. `session.currency.toLowerCase() === 'usd'`: Enforces USD currency consistency.
4. `session.amount_total > 0`: Prevents processing zero-dollar or negative payment exploits.
5. `session.id.startsWith('cs_')`: Validates Stripe session identifier.
6. `Array.isArray(items) && items.length > 0`: Validates presence of purchased formulas.

### C. Elimination of the Non-Atomic Fallback
- The previous implementation had a secondary fallback path: if `process_paid_order_atomic` failed, it performed a direct SQL insert into `orders` and executed individual `deduct_product_stock_atomic` calls, ignoring errors.
- **Remediation**: The sequential fallback has been completely removed.
- **Behavior on Database Transient Failure**: If `process_paid_order_atomic` returns an error or fails due to network outage, the webhook immediately logs the failure and responds with **HTTP 500**.
- **Stripe Automatic Retry Policy**: Stripe’s webhook infrastructure automatically retries failed deliveries with exponential backoff over a 72-hour period. Once database connectivity is restored, the next retry executes the atomic procedure cleanly.

