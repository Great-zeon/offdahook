# Off Da Hook Salon Suites — Email, Contact & Domain Setup Guide
**Updated:** November 12, 2026  
**Email Delivery Provider in Code:** Resend REST API (`https://api.resend.com/emails`) in [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js), [`api/contact.js`](file:///Users/macos/Downloads/offdahook/api/contact.js), [`api/orders.js`](file:///Users/macos/Downloads/offdahook/api/orders.js), [`api/notifications-retry.js`](file:///Users/macos/Downloads/offdahook/api/notifications-retry.js), and [`api/resend-webhook.js`](file:///Users/macos/Downloads/offdahook/api/resend-webhook.js).

---

## 1. Email & Contact Implementation Status

1. **Guessed Merchant Fallback Removed (`MERCHANT_ALERT_EMAIL` Required):**
   - The previous fallback `'offdahooksalon@gmail.com'` has been purged from SQL, Node APIs, and `.env.example`.
   - Merchant order & shortfall notifications now strictly require **`MERCHANT_ALERT_EMAIL`**. If missing, merchant jobs fail visibly (`failed`) rather than routing to an unverified mailbox.
   - Outbound sender uses **`RESEND_FROM_EMAIL`** (defaulting to `'Off Da Hook Salon Suites <orders@offdahookhairsalon.com>'` once domain verification completes).
2. **Dedicated Contact, Suite Inquiry & Career Application API Implemented ([`api/contact.js`](file:///Users/macos/Downloads/offdahook/api/contact.js)):**
   - Wired `#contact-page-form` (`contact.html`), `#suite-contact-form` (`index.html`), and `#career-application-form` (`careers.html`) to `POST /api/contact`.
   - Enforces server-side validation, length caps, honeypot spam trap, IP rate limiting (5 per 10m), 30s duplicate-payload dedup, origin validation, strict HTML escaping, Resend 10s network timeout, and preserves user form fields if provider delivery fails.
   - **Recipient Variables:**
     - `CONTACT_ALERT_EMAIL` (optional override for `#contact-page-form` & `#suite-contact-form`; falls back to `MERCHANT_ALERT_EMAIL` — never to a guessed email).
     - `CAREER_ALERT_EMAIL` (optional override for `#career-application-form`; falls back to `CONTACT_ALERT_EMAIL` or `MERCHANT_ALERT_EMAIL`).
   - **Career Form Attachments Limitation:** Direct binary CV/resume uploads are **not** supported on the web form (unsupported attachment payloads are rejected cleanly with HTTP 400 rather than silently dropped). Candidates supply a portfolio, Instagram, or resume URL instead.

---

## 2. Information Required from Business Owner (Shawnese)

1. Confirmed active inbox for **`MERCHANT_ALERT_EMAIL`** (and whether **`CONTACT_ALERT_EMAIL`** or **`CAREER_ALERT_EMAIL`** should route separately).
2. Confirmation of whether **`offdahookhairsalon.com`** is owned by her (or which custom domain she owns for `RESEND_FROM_EMAIL`).
3. Whether direct CV file uploads are needed for careers, or if portfolio/Google Drive/Dropbox links suffice.
4. Authorized **delegate DNS access** (never email passwords) to add Resend SPF/DKIM/DMARC records cleanly.

---

## 3. Resend Account, Webhooks & Safe DNS Setup

1. Add and verify Shawnese's confirmed domain in [Resend Domains](https://resend.com/domains). Never fabricate DNS record values—copy exact DKIM/SPF records shown by Resend.
2. **Never delete/replace existing root `MX` records or create conflicting root `v=spf1` records** that could disrupt incoming Gmail/GoDaddy/Google Workspace mail. Use Resend's subdomain SPF delegation (`send` or similar).
3. Create API key (`RESEND_API_KEY`) and configure webhook `https://<domain>/api/resend-webhook` (`email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`) -> `RESEND_WEBHOOK_SECRET`.
4. Note: Resend HTTP 200 API responses signify **`accepted_by_provider`**, not confirmed customer inbox delivery. Final inbox confirmation is tracked via `api/resend-webhook.js`.
