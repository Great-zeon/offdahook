# Off Da Hook Salon Suites — Payment & Email Readiness Matrix
**Code Baseline:** `ae6b58f418e4f2db66cf797bc8603e9b5358070c`  
**Audit Standard:** Zero-Trust Fact Verification (`PASS`, `FAIL`, `BLOCKED`, `NOT CONFIGURED`, `NOT TESTED`, or `NOT IMPLEMENTED`)  

> [!IMPORTANT]
> Features whose source code exists and passes local unit/static checks are **not** marked operational (`PASS` for live operation) until deployed staging/live verification actually executes.

| Area / Requirement | Current Code & Environment State | Classification | Missing Owner / Developer Dependency |
| :--- | :--- | :---: | :--- |
| **Source-code Stripe integration** | Server-side Checkout, integer-cents intent persistence, signature verification, shared validation implemented (`66/66` local checks) | **PASS** *(Source / Local Only)* | Live deployed execution still pending below |
| **Stripe account ownership** | Awaiting owner confirmation of existing/new business Stripe account & country of legal registration | **NOT CONFIGURED** | Owner confirmation & account setup |
| **Stripe business verification** | Identity, tax ID, and legal entity KYC not yet confirmed | **BLOCKED** | Owner Stripe onboarding |
| **Test API credentials** | Not configured in local environment; awaiting Preview keys (`sk_test_...`, `whsec_...`) | **NOT CONFIGURED** | Owner Stripe Test-Mode keys entered in Vercel Preview |
| **Live API credentials** | Not configured; gated behind staging verification | **NOT CONFIGURED** | Owner Stripe Live keys entered in Vercel Production |
| **Stripe webhook configuration** | Handler `/api/webhook` implemented for `completed`, `async_payment_succeeded`, `async_payment_failed`; Dashboard endpoints not yet verified | **NOT CONFIGURED** | Configure Test & Live webhook endpoints in Stripe Dashboard |
| **Test payment** | End-to-end checkout (`4242...`) awaiting deployed Vercel Preview + staging DB | **NOT TESTED** (`BLOCKED`) | Staging env setup (`ACT-01`–`ACT-03`) |
| **Live payment activation** | Explicitly held back until all staging release gates pass | **BLOCKED** | Staging verification pass + owner go-live approval |
| **Payout bank verification** | Bank routing/checking setup in Stripe not yet confirmed | **BLOCKED** | Owner payout bank setup in Stripe |
| **Resend integration (orders)** | Outbox table, `FOR UPDATE SKIP LOCKED` claim RPC, REST client (`10s` timeout), retry route, Svix webhook, configurable `RESEND_FROM_EMAIL`, and explicit `MERCHANT_ALERT_EMAIL` (no guessed fallback) implemented in code | **PASS** *(Source / Local Only)* | Live account & domain verification below |
| **Sending-domain verification** | `RESEND_FROM_EMAIL` configurable (defaults to `orders@offdahookhairsalon.com`); domain ownership & Resend verification not confirmed | **NOT CONFIGURED** | Owner confirms `offdahookhairsalon.com` + adds domain in Resend |
| **SPF / DKIM** | Not yet configured in DNS; must never be invented prior to Resend Dashboard generation | **NOT CONFIGURED** | Delegate DNS access + exact Resend DNS records |
| **DMARC** | Recommended after SPF/DKIM pass verification | **NOT CONFIGURED** | Add `_dmarc` TXT policy once SPF/DKIM verified |
| **Contact form delivery** | Dedicated `POST /api/contact` implemented & wired to `#contact-page-form`, `#suite-contact-form`, and `#career-application-form` with honeypot, throttling, HTML escaping, and explicit attachment-rejection guard (`80/80` local suite); awaits live Resend & staging test | **PASS** *(Source / Local Only)* / **NOT TESTED** *(Live)* | Configure `RESEND_API_KEY` + `MERCHANT_ALERT_EMAIL`/`CONTACT_ALERT_EMAIL` & run live staging test |
| **Merchant notifications** | Implemented via outbox with guessed fallback removed (`offdahooksalon@gmail.com` purged); fails safely unless `MERCHANT_ALERT_EMAIL` is set | **NOT TESTED** | Owner confirms active inbox (`MERCHANT_ALERT_EMAIL`) + Resend test |
| **Customer order confirmations** | Implemented via outbox + `api/orders.js` receipt resend; not yet delivered via live Resend API | **NOT TESTED** | Live Resend sending domain & test purchase |
| **Resend delivery webhook** | `api/resend-webhook.js` implemented (`email.delivered`, `bounced`, `complained`, `delivery_delayed` + Svix verification); Resend Dashboard webhook not registered | **NOT CONFIGURED** | Register webhook in Resend + configure `RESEND_WEBHOOK_SECRET` |
| **Vercel Preview variables** | Isolated staging Supabase + Stripe Test + Resend staging vars not yet entered in Vercel Preview | **NOT CONFIGURED** | Configure Preview variables & redeploy |
| **Vercel Production variables** | Not yet switched/verified with final owner `MERCHANT_ALERT_EMAIL`, `ADMIN_PIN`, `CRON_SECRET`, `STOREFRONT_URL`, live Stripe & Resend | **NOT CONFIGURED** | Configure Production variables after staging passes |
| **Production deployment verification** | Held back strictly per release gate rules | **BLOCKED** | All staging gates (`ACT-01`–`ACT-05`) |
