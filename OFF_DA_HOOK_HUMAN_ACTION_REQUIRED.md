# Off Da Hook Salon Suites — Human Action Register
**Date**: November 11, 2026  
**Auditor**: Zero-Trust Security & Systems Architect  
**Objective**: Non-Delegable Merchant & Developer Actions Prior to Public Store Launch  
**Status**: PENDING HUMAN EXECUTION  

---

## 1. Zero-Trust Policy

Under zero-trust engineering rules, an automated assistant or developer must **never** execute production database migrations or handle private merchant credentials autonomously. The following 4 actions require explicit human execution.

---

## 2. Action Checklist

| ID | Category | Required Action | Location | Risk | Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **ACT-01** | **Database Migration** | Execute [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) in the Supabase SQL Editor. | [Supabase Project `xtdoqeoaflhvdduygndr`](https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr/sql) | Low (Idempotent script; uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`) | **PENDING** |
| **ACT-02** | **Stripe Webhook Secret** | Configure Webhook endpoint `https://offdahook.vercel.app/api/webhook` in Stripe Dashboard. Copy signing secret (`whsec_...`) and add to Vercel Environment Variables. | [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/) & [Vercel Project Settings](https://vercel.com/) | Low (Required for raw signature verification) | **PENDING** |
| **ACT-03** | **Admin Master Passcode** | Set `ADMIN_PIN` in Vercel Environment Variables to Shawnese's chosen master passcode (e.g. `849201`). | [Vercel Project Settings > Environment Variables](https://vercel.com/) | Low (Protects admin portal access) | **PENDING** |
| **ACT-04** | **Resend Domain Verification** | Add SPF/DKIM DNS records for `offdahookhairsalon.com` in your domain registrar, and add `RESEND_API_KEY` to Vercel. | [Resend Dashboard](https://resend.com/) & Domain DNS | Low (Required for `@offdahookhairsalon.com` sender) | **PENDING** |

---

## 3. Step-by-Step Instructions

### Step 1: Execute Database Migration (ACT-01)
1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr/sql).
2. Open local file [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql).
3. Copy all contents, paste into the SQL Editor, and click **Run**.
4. Confirm success output. All tables, procedures, permissions, and RLS policies are compiled.

### Step 2: Configure Webhook Signing Secret (ACT-02)
1. Open [Stripe Dashboard](https://dashboard.stripe.com/) > **Developers > Webhooks**.
2. Click **Add endpoint**. Set URL: `https://offdahook.vercel.app/api/webhook`.
3. Event to listen for: `checkout.session.completed`.
4. Copy the revealed Signing Secret (`whsec_...`).
5. In [Vercel Project Settings](https://vercel.com/) > **Environment Variables**, create `STRIPE_WEBHOOK_SECRET` with the copied value.

### Step 3: Set Admin Passcode (ACT-03)
1. In Vercel Project Settings > **Environment Variables**, add `ADMIN_PIN` with your secure passcode.
2. Trigger a redeployment in Vercel to refresh serverless container environments.
