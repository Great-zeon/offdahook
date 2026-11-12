# Off Da Hook Salon Suites — Email, Contact & Domain Setup Guide
**Code Baseline:** `ae6b58f418e4f2db66cf797bc8603e9b5358070c`  
**Email Delivery Provider in Code:** Resend REST API (`https://api.resend.com/emails`) in [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js), [`api/orders.js`](file:///Users/macos/Downloads/offdahook/api/orders.js), [`api/notifications-retry.js`](file:///Users/macos/Downloads/offdahook/api/notifications-retry.js), and [`api/resend-webhook.js`](file:///Users/macos/Downloads/offdahook/api/resend-webhook.js).

---

## 1. Important Code Audit Findings About Email & Contact Forms

1. **Mailbox vs. Transactional Sender (Two Different Services):**
   - **Business Mailbox** (e.g. Google Workspace, GoDaddy Email, or Gmail): Used by Shawnese to *receive* replies/enquiries and manually correspond with clients. Never confuse a mailbox login password with a Resend API key.
   - **Resend (`RESEND_API_KEY`):** Used by the backend serverless API to *send* automated transactional receipts and merchant order alerts, and track delivery/bounces via [`api/resend-webhook.js`](file:///Users/macos/Downloads/offdahook/api/resend-webhook.js).
2. **Hardcoded Addresses & Discrepancy Found in Source:**
   - **Sender (`from`)** is hardcoded in [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js#L33) to:  
     `Off Da Hook Salon Suites <orders@offdahookhairsalon.com>`
   - **Merchant Order Alert Destination (`to`)** uses `process.env.MERCHANT_ALERT_EMAIL`, falling back to `offdahooksalon@gmail.com` (in [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L93), [`api/_notification-outbox.js`](file:///Users/macos/Downloads/offdahook/api/_notification-outbox.js#L345), and `schema.sql`).
   - **Public Website Footer & `mailto:` Contact Links** across every HTML page (`index.html`, `contact.html`, `shop.html`, `about.html`, `careers.html`, `admin.html`) list: **`offdahookhairsalon@gmail.com`** (with `hair` in the address!).
   - **Action Needed:** Shawnese must confirm which Gmail/business mailbox she actually monitors and configure `MERCHANT_ALERT_EMAIL` explicitly in Vercel so order alerts do not go to the wrong inbox.
3. **Contact Forms (`#contact-page-form`, `#suite-contact-form`, `#career-application-form`) Status:**
   - Inspection of [`main.js`](file:///Users/macos/Downloads/offdahook/main.js#L730-L857) and [`careers.html`](file:///Users/macos/Downloads/offdahook/careers.html#L1048-L1058) confirms that submitting these HTML forms currently prevents default submission and displays a browser-side confirmation card **without calling any `/api/*` backend endpoint or sending an email**.
   - Visitors reach Shawnese today via direct `mailto:offdahookhairsalon@gmail.com` links, phone `(347) 238-1602`, and external StyleSeat booking (`https://www.styleseat.com/m/v/stylist101`).
   - **If automated email delivery from those forms is wanted**, a new serverless handler (e.g., `/api/contact.js`) must be explicitly requested and built; it is currently **`NOT IMPLEMENTED`**.

---

## 2. Information Required from Business Owner (Shawnese)

1. Confirmed official customer support email address (verify `offdahookhairsalon@gmail.com` vs. a branded domain address like `support@offdahookhairsalon.com`).
2. Confirmed email address where **new order & inventory shortfall alerts** should be delivered (`MERCHANT_ALERT_EMAIL`).
3. Confirmation of whether `offdahookhairsalon.com` is actively owned by her (or if another custom domain is owned) and which provider hosts its DNS (e.g., GoDaddy, Cloudflare, Namecheap).
4. **Delegate DNS access** (never her password) or coordination to publish Resend verification records.

---

## 3. Resend Account & Webhook Configuration

Because code hardcodes `orders@offdahookhairsalon.com`, the domain **`offdahookhairsalon.com`** (not `offdahook.vercel.app`) must be verified in Resend—or `from:` updated in code if a different owned domain is chosen.

1. Log in to [Resend Dashboard](https://resend.com/) > **Domains > Add Domain** and enter Shawnese's sending domain (`offdahookhairsalon.com` or subdomain e.g. `mail.offdahookhairsalon.com`).
2. Create an API key under **API Keys** with sending permissions -> store in Vercel as **`RESEND_API_KEY`**.
3. Under **Webhooks > Add Webhook**:
   - **Endpoint URL:** `https://<deployed-domain>/api/resend-webhook` (separate endpoints recommended for Staging Preview vs. Production).
   - **Required Events:** `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`.
4. Copy the Svix **Signing Secret** (`whsec_...`) -> store in Vercel as **`RESEND_WEBHOOK_SECRET`**.

---

## 4. Safe DNS Configuration Instructions (Zero Mail Disruption)

> [!CAUTION]
> **Do NOT invent DNS record values.** Obtain the exact `Host/Name`, `Type`, and `Value` directly from your Resend Domain page after adding the domain.  
> **Do NOT delete or replace existing `MX` records.** Existing `MX` records route Shawnese's incoming mailbox (GoDaddy Email / Google Workspace / Microsoft 365). Modifying them will break incoming mail.  
> **Do NOT add a second `v=spf1 ...` TXT record** on the root `@` domain if one already exists—multiple root SPF TXT records invalidate SPF authentication. If sending from a subdomain (recommended by Resend, e.g., `send.offdahookhairsalon.com`), Resend's SPF `MX`/`TXT` records sit cleanly on the subdomain without touching root SPF/MX records!

1. **DKIM (`TXT` or `CNAME` records):** Copy exact Resend-generated DKIM host/values into DNS to cryptographically sign outgoing emails.
2. **SPF (`TXT` / subdomain `MX`):** Add exact Resend-generated SPF records (on Resend's designated subdomain such as `send` so existing root `@` mail routing remains untouched).
3. **DMARC (`TXT` at `_dmarc`):** Once SPF and DKIM show **Verified** in Resend, add a monitoring policy if none exists (e.g., `v=DMARC1; p=none; rua=mailto:<owner-dmarc-inbox>`) to protect domain reputation without blocking mail during initial rollout.
4. **Verification:** Click **Verify DNS Records** in [Resend Domains](https://resend.com/domains) after DNS propagation and wait for **Verified** green status before testing live email dispatch.
