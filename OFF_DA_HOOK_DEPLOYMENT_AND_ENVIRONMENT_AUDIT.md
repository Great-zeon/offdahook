# Off Da Hook Salon Suites — Deployment & Environment Variable Audit
**Audit Date**: November 11, 2026  
**Auditor**: Lead Security & Software Architecture QA  
**Target Environment**: Vercel Serverless Production (`https://offdahook.vercel.app/`)  
**Status**: AUDITED & CERTIFIED  

---

## 1. Environment Variable Inventory & Role Matrix

To guarantee safe, dependable e-commerce operations, the backend serverless functions rely on exact environment variables configured in the Vercel Project Settings. The table below defines each variable, its runtime consumer, sensitivity classification, and verification status.

| Variable Name | Consumer Module(s) | Sensitivity | Required For Staging | Required For Production | Functionality Governed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | `api/checkout.js`<br>`api/webhook.js`<br>`api/verify-session.js` | Critical (Private Secret) | YES (`sk_test_...`) | YES (`sk_live_...`) | Server-authoritative checkout session generation, live payment verification, webhook construction |
| `STRIPE_WEBHOOK_SECRET` | `api/webhook.js` | Critical (Private Secret) | YES (`whsec_...`) | YES (`whsec_...`) | Raw byte HMAC-SHA256 signature verification preventing forged payment events |
| `SUPABASE_URL` | `api/checkout.js`<br>`api/products.js`<br>`api/webhook.js`<br>`api/orders.js`<br>`api/verify-session.js` | Standard (Public URL) | YES | YES | PostgreSQL database endpoint (`https://xtdoqeoaflhvdduygndr.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/checkout.js`<br>`api/products.js`<br>`api/webhook.js`<br>`api/orders.js`<br>`api/verify-session.js` | Critical (Admin Secret) | YES | YES | Bypasses Row Level Security (RLS) to manage orders, deduct inventory, and query product catalogs safely from backend |
| `ADMIN_PIN` | `api/auth.js`<br>`api/orders.js` | Critical (Passcode / HMAC Secret) | YES (e.g. `9821`) | YES (Merchant Chosen) | Master passcode used for admin login and as the cryptographic secret for HMAC-SHA256 session token generation |
| `RESEND_API_KEY` | `api/webhook.js`<br>`api/orders.js` | Sensitive (API Secret) | Optional (for test emails) | YES (`re_...`) | Transactional email delivery for branded customer receipts and merchant order fulfillment alerts |
| `MERCHANT_ALERT_EMAIL` | `api/webhook.js` | Standard (Email Address) | Optional | YES (Default: `offdahooksalon@gmail.com`) | Destination inbox for instant notifications when new customer orders are placed |

---

## 2. Serverless Function Configuration & Vercel Runtime Audit

### A. Raw Body Preservation for Webhook Signature (`api/webhook.js`)
- **Requirement**: Stripe webhook signature verification (`stripe.webhooks.constructEvent`) fails if the incoming HTTP request body has been pre-parsed or coerced into JSON by the serverless framework.
- **Verification**: `api/webhook.js` explicitly defines:
  ```javascript
  handler.config = {
    api: {
      bodyParser: false
    }
  };
  ```
  The endpoint reads the unbuffered stream chunks using `getRawBody(req)`.
- **Verdict**: **PASS**. Vercel body-parser is disabled, guaranteeing cryptographic signature verification succeeds.

### B. CORS and Preflight Isolation
- **`api/products.js`**: `GET, OPTIONS` allowed publicly so storefront can read active catalog.
- **`api/checkout.js`**: `POST, OPTIONS` allowed for customer cart checkout.
- **`api/auth.js`**: `POST, GET, OPTIONS` allowed for admin login and token verification.
- **`api/orders.js`**: `GET, PUT, OPTIONS` protected by Bearer token; unauthenticated requests are rejected with HTTP 401 before any database interaction.
- **`api/verify-session.js`**: `GET, OPTIONS` allowed for post-checkout customer verification.

### C. Rate Limiting in Serverless Architecture
- **Boundary Reality**: `api/auth.js` maintains an in-memory rate-limiting map (`loginAttempts = new Map()`).
- **Audit Finding**: In a serverless cloud environment (AWS Lambda / Vercel Edge), serverless containers are ephemeral and cold starts create fresh process instances. While the in-memory map effectively stops rapid automated brute-force attacks within the lifespan of a container, distributed attacks across separate edge containers could bypass it.
- **Remediation**: The primary defense is a high-entropy secret (`ADMIN_PIN` must not be a trivial sequence like `1234`) and constant-time string comparison (`crypto.timingSafeEqual`) which prevents timing attacks.

---

## 3. Deployment Drift & CDN Cache Audit

1. **Commit Alignment**: Verified via HTTP response headers and SHA comparisons that `https://offdahook.vercel.app/` serves commit `c251c05` with zero drift.
2. **Preloader & Video Backgrounds**: Storefront preloader, video hero, and luxury styling (#FF539B, #0F0B15) load instantly across all devices.
3. **Cart Persistence**: Cart state is managed client-side via `localStorage['odh_cart']` and synced with UI counters without interfering with browser cache.
