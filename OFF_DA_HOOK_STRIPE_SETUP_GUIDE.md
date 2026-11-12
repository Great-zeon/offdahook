# Off Da Hook Salon Suites — Stripe Payments Setup Guide
**Code Baseline:** `ae6b58f418e4f2db66cf797bc8603e9b5358070c`  
**Checkout Architecture Verified in Code:** Server-side Stripe Checkout Sessions (`payment_method_types: ['card']`) via [`api/checkout.js`](file:///Users/macos/Downloads/offdahook/api/checkout.js), [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js), and [`api/verify-session.js`](file:///Users/macos/Downloads/offdahook/api/verify-session.js).

---

## 1. Account Ownership & Country Eligibility Policy

- **Merchant Ownership Rule:** The Stripe account **must** belong directly to Shawnese Parker's legal business entity. Never register a Stripe account in the developer's name or on behalf of a third party's personal bank account.
- **Country Registration Caution:** Even though the salon suite operates at Phenix Salon Suites (Rosedale, NY) and ships to `'US'` (`allowed_countries: ['US']` in [`api/checkout.js`](file:///Users/macos/Downloads/offdahook/api/checkout.js#L225)), **do not assume US entity registration without verifying**.
  - If the legal business is registered in the **United States**, Shawnese must onboard with genuine US business formation documents, US Tax ID (EIN/SSN), and a US business checking account.
  - If the legal business is registered **outside the US** (for example, Nigeria, which is not a standard Stripe-supported country), do **not** attempt to bypass Stripe residency rules with borrowed US addresses or third-party bank details; evaluate a legitimate supported business entity or alternative eligible payment gateway before going live.

---

## 2. Information Shawnese Must Prepare for Stripe Onboarding

1. **Business Details:** Legal business name, entity structure (Sole Proprietorship, LLC, Corporation), registration number/EIN (or Tax ID), country of legal registration, business street address, telephone number, business website URL, and clear product description (retail salon hair-care serums, shampoos, styling gels, tools, bundles).
2. **Account Representative & Beneficial Owners:** Representative's full legal name, date of birth, residential address, government-issued photo ID, and ownership details for any individuals owning >=25% equity (if corporate/LLC).
3. **Payout Banking:** Business checking account number and routing number matching the legal business name (plus micro-deposit or instant bank verification if prompted by Stripe).

---

## 3. Code-Verified Integration Requirements (No Invented Keys)

Direct inspection of `api/*.js`, `main.js`, and HTML files confirms:
- **Publishable Key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `pk_...`):** **NOT USED** anywhere in the codebase. Frontend redirects directly to the hosted Stripe Checkout URL returned by `POST /api/checkout`. (It remains unused boilerplate in `.env.example`.)
- **Required Stripe Variables Used by Code:**
  1. `STRIPE_SECRET_KEY` — Used in [`api/checkout.js`](file:///Users/macos/Downloads/offdahook/api/checkout.js#L18), [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L20), and [`api/verify-session.js`](file:///Users/macos/Downloads/offdahook/api/verify-session.js#L19).
  2. `STRIPE_WEBHOOK_SECRET` — Used in [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js#L50) for raw-body signature verification.
- **Required Stripe Payment Methods:** Card payments (`payment_method_types: ['card']`).
- **Required Webhook Endpoint URL:** `https://<deployed-domain>/api/webhook` (Production: `https://offdahook.vercel.app/api/webhook`, or staging preview URL for Test Mode).
- **Exact Webhook Events Handled by Code:**
  1. `checkout.session.completed` (mandatory)
  2. `checkout.session.async_payment_succeeded` (defensive handler implemented)
  3. `checkout.session.async_payment_failed` (defensive handler implemented)

---

## 4. Test Mode vs. Live Mode Configuration Steps

> [!CAUTION]
> Never request or transmit `sk_live_...`, `sk_test_...`, or `whsec_...` over WhatsApp, SMS, email, or chat. Shawnese should either enter secrets directly into **Vercel Project Settings** or invite the developer as a limited **Developer** team member inside Stripe Dashboard.

### A. Stripe Test Mode (For **Vercel Preview / Staging** Only)
1. In [Stripe Dashboard](https://dashboard.stripe.com/), toggle **Test mode** ON.
2. Copy the **Secret key** (`sk_test_...`) and add it to **Vercel > Project > Settings > Environment Variables** scoped strictly to **Preview** as `STRIPE_SECRET_KEY`.
3. Navigate to **Developers > Webhooks > Add endpoint**:
   - URL: `https://<vercel-preview-staging-domain>/api/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
4. Reveal the **Signing secret** (`whsec_...`) and add it to Vercel **Preview** as `STRIPE_WEBHOOK_SECRET`.
5. Trigger a Vercel Preview redeployment so environment changes take effect.

### B. Stripe Live Mode (For **Vercel Production** Only After Staging Passes)
1. Confirm Stripe business verification, identity verification, and payout bank verification show **Enabled / Active** in Stripe Dashboard (toggle **Test mode** OFF).
2. Reveal the Live **Secret key** (`sk_live_...`) and add it to Vercel **Production** environment scope as `STRIPE_SECRET_KEY`.
3. In Live **Developers > Webhooks > Add endpoint**:
   - URL: `https://offdahook.vercel.app/api/webhook` (or final live canonical domain).
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
4. Copy the Live webhook **Signing secret** (`whsec_...`) into Vercel **Production** as `STRIPE_WEBHOOK_SECRET`.
5. Redeploy Production for variables to activate.
