# Off Da Hook Salon Suites — Vercel Environment Setup
**Updated:** November 12, 2026  
**Vercel Configuration Path:** **Vercel Dashboard → Project (`offdahook`) → Settings → Environment Variables**  

---

## 1. Authoritative Environment Variable Matrix (13 Variables)

All variables below are verified directly in source code (`api/*.js`). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unused by the code and **not** required.

| Variable | Purpose & Code Reference | Preview (Staging) | Production | Provided By & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `STOREFRONT_URL` | Canonical redirect origin for Stripe & CORS fallback ([`api/_payment-validation.js`](file:///Users/macos/Downloads/offdahook/api/_payment-validation.js)) | Optional (`https://<preview-url>`) | **Required** (`https://offdahook.vercel.app` or verified canonical domain) | Developer-configured app value |
| `STRIPE_SECRET_KEY` | Stripe Checkout sessions & retrieval (`checkout.js`, `webhook.js`, `verify-session.js`) | **Required** (`sk_test_...`) | **Required** (`sk_live_...`) | Owner Stripe account (**Secret credential**) |
| `STRIPE_WEBHOOK_SECRET` | Raw-body HMAC verification for `/api/webhook` | **Required** (Test `whsec_...`) | **Required** (Live `whsec_...`) | Owner Stripe Dashboard / Developer (**Secret credential**) |
| `SUPABASE_URL` | Target PostgreSQL REST URL (all DB APIs) | **Required** (Staging Supabase URL) | **Required** (Production Supabase URL) | Developer infrastructure (**Public config**) |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server DB access & RPCs (all DB APIs) | **Required** (Staging key) | **Required** (Production key) | Developer infrastructure (**Secret credential**) |
| `RESEND_API_KEY` | Email dispatch via Resend (`_notification-outbox.js`, `contact.js`, `orders.js`) | **Required** (Staging Resend key) | **Required** (Production Resend key) | Owner/Developer Resend (**Secret credential**) |
| `RESEND_WEBHOOK_SECRET` | Svix signature verification for `/api/resend-webhook` | **Required** (Staging `whsec_...`) | **Required** (Production `whsec_...`) | Resend Dashboard (**Secret credential**) |
| `RESEND_FROM_EMAIL` | Verified sender identity (e.g. `Off Da Hook Salon Suites <orders@offdahookhairsalon.com>`) | Optional (`onboarding@resend.dev` for Resend test mode if allowed) | **Required** (Verified owner domain sender) | Owner + Developer (**Public/Config**) |
| `MERCHANT_ALERT_EMAIL` | Authoritative inbox for paid order & shortfall alerts (`webhook.js`, `_notification-outbox.js`, fallback for `contact.js`) | **Required** (Authorized staging test inbox) | **Required** (Shawnese's confirmed inbox) | **Owner-provided business info** |
| `CONTACT_ALERT_EMAIL` | Optional separate inbox for `#contact-page-form` & `#suite-contact-form` (`api/contact.js`) | Optional (Test inbox) | Optional (Falls back to `MERCHANT_ALERT_EMAIL`) | **Owner-provided business info** |
| `CAREER_ALERT_EMAIL` | Optional separate inbox for `#career-application-form` (`api/contact.js`) | Optional (Test inbox) | Optional (Falls back to `CONTACT_ALERT_EMAIL` / `MERCHANT_ALERT_EMAIL`) | **Owner-provided business info** |
| `ADMIN_PIN` | Admin passcode & HMAC-SHA256 signing key (`auth.js`, `orders.js`, `products.js`, `notifications-retry.js`) | **Required** (Staging PIN) | **Required** (Strong owner-chosen PIN) | Owner + Developer (**Secret credential**) |
| `CRON_SECRET` | Protects outbox retry worker (`notifications-retry.js`) | Recommended (`32+` char random string) | **Required** (`32+` char random string) | Developer-generated (**Secret credential**) |

---

## 2. Deployment Activation Reminder
Changing any variable in **Vercel Dashboard → Settings → Environment Variables** does **not** apply to active containers automatically—you must trigger a new **Redeploy** on the target Preview or Production environment for new values to load.
