# OFF DA HOOK — EXTERNAL DEPENDENCIES & HUMAN ACTION REQUIRED
**Target System:** Off Da Hook Salon Suites E-Commerce Application  
**Audit Stage:** Post-Hardening Production Assessment  
**Audience:** Website Owner (Shawnese Parker), Developer & Operations Team  
**Security Policy:** Never transmit production secret keys in chat or commit them to Git. Add them directly into the Vercel Dashboard under **Project Settings > Environment Variables**.

---

## 1. BLOCKER REGISTER & ACTION MATRIX

| Blocker ID | Missing Item | Why Required | Affected Feature | Responsible Party | Required Next Step | Severity | Status |
| :---: | :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| **BLK-01** | Supabase Migration Execution | Deploys RLS, atomic procedure `process_paid_order_atomic`, and constraints. | Database security, inventory concurrency, orders persistence. | Developer / Ops | Run updated `schema.sql` in Supabase SQL Editor. | **CRITICAL** | **PENDING EXECUTION** |
| **BLK-02** | Stripe Secret Key | Required to authenticate Stripe API and create Checkout Sessions. | Storefront checkout pipeline (`/api/checkout`, `/api/verify-session`). | Developer / Shawnese | Add `STRIPE_SECRET_KEY` (`sk_test_...` or `sk_live_...`) to Vercel. | **CRITICAL** | **PENDING INPUT** |
| **BLK-03** | Stripe Webhook Secret | Required to cryptographically verify HMAC-SHA256 signatures on incoming webhooks. | Order persistence and inventory deduction (`/api/webhook`). | Developer / Shawnese | Add endpoint in Stripe (`/api/webhook`); copy `whsec_...` to Vercel. | **CRITICAL** | **PENDING INPUT** |
| **BLK-04** | Admin Master Passcode | Required to generate cryptographically signed HMAC session tokens for dashboard. | Admin Dashboard authentication & inventory management (`/api/auth`, `/api/orders`). | Shawnese Parker | Define `ADMIN_PIN` in Vercel (e.g. high-entropy alphanumeric passcode). | **CRITICAL** | **PENDING INPUT** |
| **BLK-05** | Resend API Key | Required to dispatch transactional confirmation receipts to customers and alerts to Shawnese. | Automated email receipts and merchant alerts (`/api/webhook`, `/api/orders`). | Developer / Shawnese | Create account at [Resend.com](https://resend.com); copy `re_...` to Vercel. | **HIGH** | **PENDING INPUT** |
| **BLK-06** | Verified Sender Domain | Prevents order receipts from landing in spam/junk folders. | Email deliverability for `orders@offdahookhairsalon.com`. | Developer / Domain Host | Add 3 DNS records (DKIM, SPF, MX) to domain registrar. | **HIGH** | **PENDING INPUT** |
| **BLK-07** | Merchant Notification Email | Destination address for real-time mobile order alerts. | Notifying Shawnese when orders are placed. | Shawnese Parker | Confirm preferred email (default: `offdahooksalon@gmail.com`). Set in Vercel. | **MEDIUM** | **RESOLVED BY DEFAULT** |

---

## 2. DETAILED STEP-BY-STEP HUMAN ACTION GUIDE

### Action 1: Execute Idempotent Database Migration (`schema.sql`)
1. Log into Supabase Dashboard: `https://supabase.com/dashboard/project/xtdoqeoaflhvdduygndr`
2. Click **SQL Editor** on the left menu.
3. Click **New Query**.
4. Copy the entire contents of the hardened [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) file.
5. Click **Run**.
6. **Safety Verification:** The script is completely non-destructive:
   - Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (preserves existing orders).
   - Uses `ON CONFLICT (id) DO NOTHING` for products (preserves existing custom stock/pricing).
   - Deploys RLS policies and the unified procedure `process_paid_order_atomic`.

### Action 2: Configure Vercel Production Environment Variables
Navigate to **Vercel Dashboard > offdahook > Settings > Environment Variables** and ensure the following keys are defined:

```bash
# 1. Stripe Payment Gateway
STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
STRIPE_WEBHOOK_SECRET=whsec_...

# 2. Supabase Cloud Database (REST Engine)
SUPABASE_URL=https://xtdoqeoaflhvdduygndr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_prs...

# 3. Administrative Security
ADMIN_PIN=<chosen_secure_passcode>

# 4. Transactional Email Pipeline (Resend)
RESEND_API_KEY=re_...
MERCHANT_ALERT_EMAIL=offdahooksalon@gmail.com
```

### Action 3: Register Stripe Webhook Endpoint
1. Go to **Stripe Dashboard > Developers > Webhooks**.
2. Click **Add endpoint**.
3. **Endpoint URL:** `https://offdahook.vercel.app/api/webhook`
4. **Events to listen for:** `checkout.session.completed` and `charge.refunded`.
5. Reveal **Signing Secret** (`whsec_...`) and paste into Vercel.

---

## 3. SUMMARY OF HUMAN OPERATIONAL DECISIONS

1. **Shipping Carrier & Fulfillment:**
   - Confirm that Shawnese fulfills orders manually via **USPS Ground Advantage / Priority Mail** or **UPS Ground**.
   - Flat rate shipping is pre-configured at **$6.95** in Stripe Checkout.
2. **Cosmetic Hygiene Policy:**
   - Standard retail cosmetic return policy applies: *All sales are final once safety seal is broken, except for transit damage claims submitted within 48 hours.*
3. **PayPal Decision:**
   - Storefront and admin dashboard now reflect **100% genuine Stripe processing** (Visa, Mastercard, Amex, Apple Pay, Google Pay). Non-existent PayPal labels have been removed.
