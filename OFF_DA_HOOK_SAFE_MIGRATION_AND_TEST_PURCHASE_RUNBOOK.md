# Off Da Hook Salon Suites — Safe Migration & Test Purchase Runbook
**Date**: November 11, 2026  
**Auditor**: Zero-Trust Lead QA Engineer  
**Objective**: Step-by-Step Staging Verification Protocol with Zero Risk of Financial or Data Corruption  

---

## 1. Scope & Prerequisites

This runbook guides the lead developer and merchant through staging verification before accepting public customer payments.

### Required Access
- Supabase Project Admin (`xtdoqeoaflhvdduygndr`)
- Vercel Project Admin (`offdahook`)
- Stripe Dashboard (in Test Mode)
- Access to email inbox for receipt verification

---

## 2. Phase 1: Database Migration & Backup Verification

### Step 1.1: Snapshot Existing Data
1. Navigate to Supabase Dashboard > **Database > Tables**.
2. If `orders` or `products` already contain production rows, click **Export data to CSV** to keep a localized offline backup.

### Step 1.2: Execute `schema.sql`
1. Open `schema.sql` in VS Code.
2. In Supabase **SQL Editor**, paste the SQL script and click **Run**.
3. **Safety Verification**:
   - Confirm `ON CONFLICT (id) DO NOTHING` prevents overwriting customized product entries.
   - Confirm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` preserves all existing order rows.
   - Confirm `process_paid_order_atomic` compiles with `SECURITY DEFINER SET search_path = public, pg_temp;`.

---

## 3. Phase 2: Stripe Test-Mode Integration Check

### Step 2.1: Confirm Environment Keys
Ensure Vercel environment variables are set to Stripe Test Mode:
- `STRIPE_SECRET_KEY`: `sk_test_...`
- `STRIPE_WEBHOOK_SECRET`: `whsec_...` (from test webhook endpoint)
- `ADMIN_PIN`: (Your designated test PIN)

### Step 2.2: Perform Test Purchase (Browser Walkthrough)
1. Navigate to `https://offdahook.vercel.app/shop.html`.
2. Select **"Loc Butta Sauce"** ($25.00) and click **"Add to Cart"**.
3. Open the Crown Bag slide-over drawer:
   - Verify item title, quantity (1), and subtotal ($25.00) display correctly.
   - Click increment `+` to change to 2; verify subtotal updates to $50.00.
   - Click decrement `-` to return to 1 ($25.00).
4. Click **"Secure Checkout"**:
   - The UI displays the loading spinner and redirects to `checkout.stripe.com`.
5. On the Stripe Checkout page:
   - **Card Number**: `4242 4242 4242 4242`
   - **Exp**: `12/28`, **CVC**: `123`, **Name**: `Jane Test Doe`
   - **Shipping Address**: Enter a valid US address (e.g., 243-02 Merrick Blvd, Rosedale, NY 11422).
   - **Phone**: `(347) 555-0199`
   - Click **Pay**.

---

## 4. Phase 3: Post-Purchase Pipeline Verification

### Step 3.1: Storefront Return & Modal
1. Upon payment success, Stripe redirects back to:  
   `https://offdahook.vercel.app/shop.html?order=success&session_id=cs_test_...`
2. **Verify Modal**:
   - Confirmation modal appears with title "Crown Order Confirmed!".
   - Displays real Order ID (format: `ODH-YYYYMMDD-XXXX`).
   - Customer name, shipping address, and purchased item list match the checkout input.
   - Crown cart badge in the navigation resets to `0`.

### Step 3.2: Database Persistence & Concurrency
1. In Supabase Dashboard > **Table Editor > orders**:
   - Check the newly created row.
   - Verify `stripe_session_id` is populated.
   - Verify `payment_status` is `'Paid'` and `fulfillment_status` is `'Pending'`.
2. In Supabase Dashboard > **Table Editor > products**:
   - Locate `loc-butta-sauce`.
   - Verify `stock` was decremented by exactly 1 unit.
3. In Supabase Dashboard > **Table Editor > webhook_events**:
   - Confirm Stripe event `evt_...` or reconciliation event `reconciled-cs_test_...` is logged.

### Step 3.3: Webhook Idempotency Test
1. In Stripe Dashboard > **Developers > Webhooks > Events**:
   - Locate the test `checkout.session.completed` event.
   - Click **Resend event**.
2. In the Supabase `orders` table:
   - Confirm **NO duplicate order** was created.
   - In `products` table, confirm stock was **NOT decremented a second time**.
   - Stripe receives HTTP 200 with `{ "received": true, "message": "Event already processed" }`.

### Step 3.4: Admin Dashboard Fulfillment Test
1. Navigate to `https://offdahook.vercel.app/admin.html`.
2. Enter the test `ADMIN_PIN`:
   - Dashboard unlocks, displaying order statistics.
3. In the Orders table:
   - Locate the test order `ODH-...`.
   - Change status dropdown from **Pending** to **Shipped**.
   - Select Carrier **USPS** and enter Tracking Number `9400111899560000000000`.
   - Click **Save**.
4. Refresh `admin.html`:
   - Verify tracking information persists and tracking link generates:  
     `https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899560000000000`.

---

## 5. Phase 4: Production Flip (Live Enablement)

Once Phase 1 through 3 pass with 100% compliance:
1. In Stripe Dashboard, switch toggle to **Live Mode**.
2. Retrieve Live Keys: `pk_live_...` and `sk_live_...`.
3. In Vercel Project Settings > **Environment Variables**:
   - Set `STRIPE_SECRET_KEY` = `sk_live_...`.
   - Create live webhook endpoint pointing to `https://offdahook.vercel.app/api/webhook` and set `STRIPE_WEBHOOK_SECRET` = `whsec_...` (live).
4. Perform 1 live $1.00 or $15.00 test purchase using a personal card to confirm end-to-end banking settlement.
5. In Stripe Dashboard, immediately refund the test charge.
6. The store is officially ready for live public orders.

