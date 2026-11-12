# Off Da Hook Salon Suites — Vercel Environment Setup
**Code Baseline:** `ae6b58f418e4f2db66cf797bc8603e9b5358070c`  
**Vercel Configuration Path:** **Vercel Dashboard → Project (`offdahook`) → Settings → Environment Variables**  

---

## 1. Authoritative Environment Variable Matrix

Every variable below was verified directly via grep across `api/*.js`. Unused boilerplate (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) is **not** required by the application.

| Variable | Purpose & Code Reference | Preview (Staging) | Production | Provided By & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `STOREFRONT_URL` | Canonical redirect origin for Stripe success/cancel & CORS fallback ([`api/_payment-validation.js`](file:///Users/macos/Downloads/offdahook/api/_payment-validation.js#L22)) | Optional (`https://<preview-url>` or `https://offdahook.vercel.app`) | **Required** (`https://offdahook.vercel.app` or verified canonical custom domain) | Developer-configured application value |
| `STRIPE_SECRET_KEY` | Authoritative Stripe session creation, retrieval, and checkout verification ([`api/checkout.js`](file:///Users/macos/Downloads/offdahook/api/checkout.js#L18), [`api/verify-session.js`](file:///Users/macos/Downloads/offdahook/api/verify-session.js#L19)) | **Required** (Test key `sk_test_...`) | **Required** (Live key `sk_live_...`) | Owner account (**Secret credential**) |
| `STRIPE_WEBHOOK_SECRET` | Raw-body HMAC signature verification for `/api/webhook` ([`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L50)) | **Required** (Test endpoint `whsec_...`) | **Required** (Live endpoint `whsec_...`) | Owner Stripe Dashboard / Developer (**Secret credential**) |
| `SUPABASE_URL` | Target PostgreSQL database REST URL (all `api/*.js` routes) | **Required** (Isolated Staging Supabase URL) | **Required** (Production Supabase URL) | Developer-configured infrastructure (**Public URL**) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged DB access & RLS/RPC execution (all `api/*.js` routes) | **Required** (Staging Service Role Key) | **Required** (Production Service Role Key) | Developer-configured infrastructure (**Secret credential**) |
| `RESEND_API_KEY` | Transactional email dispatch via Resend REST API ([`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js#L27)) | **Required** (Staging/Test API key) | **Required** (Production API key) | Owner/Developer Resend account (**Secret credential**) |
| `RESEND_WEBHOOK_SECRET` | Svix signature verification for `/api/resend-webhook` delivery/bounce tracking ([`api/resend-webhook.js`](file:///Users/macos/Downloads/offdahook/api/resend-webhook.js#L68)) | **Required** (Staging webhook `whsec_...`) | **Required** (Production webhook `whsec_...`) | Owner/Developer Resend Dashboard (**Secret credential**) |
| `MERCHANT_ALERT_EMAIL` | Destination inbox for merchant order & shortfall alerts ([`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L93), [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js#L345)) | **Recommended** (Developer/Test inbox—avoid spamming real customers/store owner) | **Required** (Shawnese's confirmed active inbox; prevents fallback to `offdahooksalon@gmail.com`) | **Owner-provided business information** |
| `ADMIN_PIN` | Master login passcode & HMAC-SHA256 token signing key ([`api/auth.js`](file:///Users/macos/Downloads/offdahook/api/auth.js#L62), [`api/orders.js`](file:///Users/macos/Downloads/offdahook/api/orders.js#L44), [`api/products.js`](file:///Users/macos/Downloads/offdahook/api/products.js#L33)) | **Required** (Staging passcode) | **Required** (Strong owner-chosen PIN) | Owner-provided + Developer-configured (**Secret credential**) |
| `CRON_SECRET` | Protects automated outbox retry invocation via `x-cron-secret` header ([`api/notifications-retry.js`](file:///Users/macos/Downloads/offdahook/api/notifications-retry.js#L46)) | **Optional / Recommended** (Random 32+ char token) | **Required** (Random 32+ char token) | Developer-generated (**Secret credential**) |

---

## 2. Entry & Redeployment Procedure in Vercel

1. Open **Vercel Dashboard → Project → Settings → Environment Variables**.
2. Enter each **Preview** variable cleanly by unchecking **Production** and **Development** (keeping test Stripe keys & staging Supabase strictly isolated from Production).
3. Enter **Production** variables only after Staging gates (`ACT-01`–`ACT-05`) have passed and live Stripe/Resend verification is complete.
4. **Mandatory Redeploy Rule:** Vercel serverless functions inject environment variables at deployment build/boot time. **Any change to an environment variable requires triggering a new deployment** (**Deployments → ⋯ → Redeploy**) before the new configuration takes effect.
5. Never print secret values in build logs, client JavaScript, or Git commits.
