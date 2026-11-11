# Off Da Hook Salon Suites — Final Human Action Register
**Date**: November 11, 2026  
**Auditor**: Zero-Trust Independent QA Lead  
**Mandate**: Non-Delegable Merchant & Developer Actions Prior to Production Operation  

---

## 1. Executive Summary

All application code, API handlers, stored procedures, and fallback reconciliation mechanisms have been audited, hardened, and verified. However, because this platform handles **real customer credit cards, real financial transfers, and real inventory**, certain security actions require human credentials and merchant account authority.

**Under zero-trust protocol, an automated agent must never possess or execute private production administrative credentials.** The 5 actions below must be completed manually.

---

## 2. Human Action Checklist

| Priority | ID | Category | Action Description | Responsible Party | Estimated Time | Verification Method |
| :---: | :---: | :--- | :--- | :--- | :---: | :--- |
| **P0** | **ACT-01** | **Database Migration** | Execute hardened `schema.sql` inside the Supabase SQL Editor (`https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr/sql`). | Developer / Lead | 3 mins | Check `orders` table columns, `webhook_events` table, and `process_paid_order_atomic` function in Database Schema. |
| **P0** | **ACT-02** | **Stripe Webhook Secret** | Configure Webhook in Stripe Dashboard pointing to `https://offdahook.vercel.app/api/webhook` listening for `checkout.session.completed`. Copy Signing Secret (`whsec_...`) into Vercel `STRIPE_WEBHOOK_SECRET`. | Developer / Merchant | 5 mins | Trigger "Send test event" in Stripe Dashboard; verify HTTP 200 response in Stripe Webhook logs. |
| **P0** | **ACT-03** | **Admin Security PIN** | Set `ADMIN_PIN` in Vercel Environment Variables to Shawnese's chosen 6-to-8 digit secure master passcode. Redeploy or restart Vercel functions. | Shawnese / Developer | 2 mins | Navigate to `https://offdahook.vercel.app/admin.html`, enter passcode, confirm dashboard unlocks. |
| **P1** | **ACT-04** | **Stripe Keys Transition** | Switch Vercel `STRIPE_SECRET_KEY` from `sk_test_...` to live `sk_live_...` only after completing test transactions (ACT-05). | Merchant (Shawnese) | 2 mins | Verify live checkout session loads in browser without test mode banner. |
| **P1** | **ACT-05** | **Resend Email Domain** | In Resend dashboard, verify sending domain `offdahookhairsalon.com` (add SPF/DKIM DNS records). Set `RESEND_API_KEY` in Vercel. | Developer | 10 mins | Place a test order; verify branded receipt arrives in customer inbox and merchant alert arrives at `offdahooksalon@gmail.com`. |

---

## 3. Detailed Action Procedures

### Action 1 (ACT-01): Supabase Database Migration
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Select project **`xtdoqeoaflhvdduygndr`**.
3. Open the **SQL Editor** from the left navigation bar.
4. Open the local file `schema.sql` from the repository.
5. Copy the entire contents, paste into the SQL Editor, and click **Run**.
6. Verify output confirms:
   - `CREATE TABLE IF NOT EXISTS products`
   - `CREATE TABLE IF NOT EXISTS orders`
   - `CREATE TABLE IF NOT EXISTS webhook_events`
   - `CREATE OR REPLACE FUNCTION process_paid_order_atomic`
   - `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ...` (all 5 email tracking columns added)
   - `CREATE POLICY ...` (Row Level Security enabled)

### Action 2 (ACT-02): Stripe Webhook Configuration
1. Log in to the [Stripe Dashboard](https://dashboard.stripe.com/).
2. Navigate to **Developers > Webhooks**.
3. Click **Add endpoint**.
4. Enter Endpoint URL: `https://offdahook.vercel.app/api/webhook`.
5. Select event to listen for: `checkout.session.completed`.
6. Click **Add endpoint**.
7. Under "Signing secret", click **Reveal**. Copy the secret string (`whsec_...`).
8. Go to [Vercel Dashboard](https://vercel.com/) > `offdahook` project > **Settings > Environment Variables**.
9. Add/Update `STRIPE_WEBHOOK_SECRET` with the copied value for Production & Preview.

### Action 3 (ACT-03): Secure Admin PIN
1. In the Vercel Dashboard, go to **Settings > Environment Variables**.
2. Set `ADMIN_PIN` to a strong unique passcode known only to Shawnese and designated salon management (e.g. `849201`).
3. Click **Save**.
4. Trigger a redeployment in Vercel to inject the updated environment variable into serverless lambdas.

---

## 4. Sign-Off Gate

Production transactions must remain disabled until ACT-01, ACT-02, and ACT-03 are completed and verified by the human developer.
