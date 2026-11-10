# OFF DA HOOK — HUMAN ACTION REQUIRED & CREDENTIAL CHECKLIST
**Project:** Off Da Hook Salon Suites E-Commerce Platform  
**Target Date:** Pre-Launch Activation  
**Audience:** Website Owner (Shawnese Parker), Project Lead & Production Operations  
**Security Warning:** NEVER commit real production secret keys (`sk_live_...`, `whsec_...`, service role keys) into GitHub or paste them into public chat. Add them directly into the Vercel Project Settings under Environment Variables.

---

## 1. STRIPE PAYMENT GATEWAY ACTIVATION

To accept real credit cards, debit cards, Apple Pay, and Google Pay from live customers, the following human actions must be completed inside the **Stripe Dashboard** (`https://dashboard.stripe.com`):

### Action 1.1: Complete Business Activation & Bank Account Link
* Log into Stripe and complete merchant identity verification (LLC / Sole Proprietorship, EIN / SSN, salon business address at Phenix Salon Suites Suite #192, Rosedale, NY).
* Add payout bank routing and account numbers so funds from hair formula sales deposit directly into Off Da Hook's bank account.

### Action 1.2: Obtain Live API Keys
* In the Stripe Dashboard, toggle from **Test Mode** to **Live Mode**.
* Navigate to **Developers > API Keys**.
* Copy the **Publishable Key** (starts with `pk_live_...`).
* Reveal and copy the **Secret Key** (starts with `sk_live_...`).
* Store this value securely in Vercel (see Section 5 below).

### Action 1.3: Configure Production Webhook Endpoint
* In Stripe Dashboard, navigate to **Developers > Webhooks**.
* Click **Add Endpoint**.
* **Endpoint URL:** `https://offdahook.vercel.app/api/webhook`
* **Events to listen for:** Select `checkout.session.completed` and `charge.refunded`.
* Click **Add endpoint**.
* In the created webhook view, reveal the **Signing Secret** (starts with `whsec_...`).
* Set `STRIPE_WEBHOOK_SECRET` in Vercel.

---

## 2. TRANSACTIONAL EMAIL INTEGRATION (RESEND)

Customers must receive an immediate, branded order confirmation receipt when they pay, and Shawnese must receive an instant alert on her phone to package the order.

### Action 2.1: Create Resend Account
* Register an account at `https://resend.com` (free tier includes 3,000 emails/month, more than enough for retail launch).

### Action 2.2: Verify Custom Domain
* Under **Domains**, add `offdahookhairsalon.com` (or your active salon domain).
* Add the 3 provided DNS records (DKIM, SPF, MX) to your domain registrar (GoDaddy, Namecheap, Google Domains, or Cloudflare).
* Wait for DNS verification status to turn green (**Verified**).

### Action 2.3: Generate API Key
* Navigate to **API Keys > Create API Key**.
* Name: `Off Da Hook Production E-Commerce`.
* Permission: Full Access.
* Copy the generated key (starts with `re_...`).
* Set `RESEND_API_KEY` in Vercel.

### Action 2.4: Specify Notification Recipient Email
* Decide Shawnese's designated email for fulfillment alerts (e.g., `offdahooksalon@gmail.com` or `shawnese@offdahookhairsalon.com`).
* Set `MERCHANT_ALERT_EMAIL` in Vercel.

---

## 3. SUPABASE DATABASE SCHEMA MIGRATION

To enforce Row Level Security (preventing anyone on the internet from reading customer addresses or altering prices) and enable race-condition-free inventory deduction:

### Action 3.1: Run Hardened Migration Script
* Log into Supabase (`https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr`).
* Click **SQL Editor** on the left navigation.
* Click **New Query**.
* Open the updated [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) file from this repository.
* Copy and paste the entire script into the Supabase SQL editor.
* Click **Run**.
* Verify that tables (`products`, `orders`, `webhook_events`), constraints, RLS policies, and the stored procedure `deduct_product_stock_atomic` are successfully applied.

---

## 4. ADMIN DASHBOARD CREDENTIAL ROTATION

The default PIN `offdahook2026` was previously disclosed in the audit and must be decommissioned immediately.

### Action 4.1: Choose a Strong Admin Passcode
* Select a private, high-entropy 8 to 16 character alphanumeric passcode known only to Shawnese Parker (e.g., `ODH#Crown2026!`).
* Set `ADMIN_PIN` in Vercel Environment Variables.
* Never commit this passcode to Git.

---

## 5. COMPLETE VERCEL ENVIRONMENT VARIABLE CHECKLIST

Go to **Vercel Dashboard > offdahook project > Settings > Environment Variables** and ensure each of the following variables is defined for **Production** and **Preview**:

| Variable Name | Required | Description | Example / Format |
| :--- | :---: | :--- | :--- |
| `STRIPE_SECRET_KEY` | **YES** | Live or Test Stripe Secret Key | `sk_live_...` (or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | **YES** | Webhook Cryptographic Signing Secret | `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional | Stripe Publishable Key | `pk_live_...` |
| `SUPABASE_URL` | **YES** | Supabase REST URL | `https://xtdoqeoaflhvdduygndr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | Supabase Service Role Secret Key | `sb_secret_prs...` (from dashboard) |
| `ADMIN_PIN` | **YES** | Private Admin Dashboard Passcode | User-chosen secure passphrase |
| `RESEND_API_KEY` | **YES** | Resend Transactional Email Key | `re_...` |
| `MERCHANT_ALERT_EMAIL` | **YES** | Notification recipient for salon orders | `offdahooksalon@gmail.com` |

---

## 6. BUSINESS & FULFILLMENT DECISIONS FOR SHAWNESE

Before going live to real customers, Shawnese Parker must confirm the following operational parameters:

1. **Shipping Fees:**
   * Standard Flat Rate: e.g., `$6.95 Flat Rate Shipping across the US`.
   * Free Shipping Threshold: e.g., `Free shipping on all orders over $75.00`.
   * Or Real-time carrier calculation.
2. **Fulfillment Courier:**
   * Will packages be shipped via USPS Ground Advantage / Priority Mail, UPS Ground, or FedEx?
3. **Cosmetic Return Policy:**
   * Because hair care serums, butters, and spritsers are personal hygiene products, the standard industry policy is: *All sales are final once packaging seals are opened, except for damaged-in-transit claims reported within 48 hours.*
   * This must be hyperlinked on the checkout and shop pages.
4. **PayPal Decision:**
   * Either register a PayPal Business Developer App to provide real PayPal checkout, OR remove the "PayPal" badge and offer 100% Stripe (which natively supports credit cards, debit cards, Apple Pay, Google Pay, and Cash App Pay).

