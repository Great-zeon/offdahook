# OFF DA HOOK — APPLICATION & TRANSACTIONAL SECURITY REPORT
**Target System:** Off Da Hook Salon Suites E-Commerce Application  
**Evaluation Standard:** OWASP Top 10 (2021), PCI-DSS Level 4 Merchant Scope, CIS Database Benchmarks  
**Classification:** Confidential Security Evaluation  
**Author:** Senior Application Security & Cloud Architecture Review  
**Date:** November 10, 2026

---

## 1. THREAT MODEL & ASSET CLASSIFICATION

### 1.1 Protected Assets
1. **Financial Integrity:** Payment authorizations, currency amounts, discount integrity, and merchant bank deposits.
2. **Customer Personally Identifiable Information (PII):** Customer full names, residential delivery addresses, email addresses, and phone numbers.
3. **Physical Inventory Assets:** Physical stock quantities of salon formulas stored at Off Da Hook Salon Suites (Suite #192, Rosedale, NY).
4. **Administrative Controls:** Privileged operations including modifying retail prices, adjusting stock, marking orders as shipped, and viewing sales ledgers.

### 1.2 Threat Actors & Attack Vectors
* **Malicious Storefront Shopper:** Manipulates HTTP POST payloads, JavaScript variables, or local storage to purchase high-value bundles at sub-penny prices.
* **Unauthenticated Internet Actor:** Probes API endpoints (`/api/orders`, `/api/products`), scans for open Supabase tables using the public anon key, or attempts to brute-force admin gates.
* **Webhook Replay / Network Glitch:** Network timeouts causing payment providers to re-transmit webhook events, potentially duplicating orders and depleting inventory.

---

## 2. COMPREHENSIVE VULNERABILITY MATRIX

| Vuln ID | Title | OWASP Category | Initial State | Post-Remediation State | Risk Level |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **VULN-01** | Arbitrary Client-Controlled Pricing | A04: Insecure Design | **CRITICAL** | **RESOLVED** | HIGH |
| **VULN-02** | Phantom Order Generation (Fake Modal) | A08: Software & Data Integrity | **CRITICAL** | **RESOLVED** | HIGH |
| **VULN-03** | Missing Supabase Row Level Security (RLS) | A01: Broken Access Control | **CRITICAL** | **RESOLVED** | CRITICAL |
| **VULN-04** | Webhook Raw Body Signature Bypass | A08: Software & Data Integrity | **CRITICAL** | **RESOLVED** | CRITICAL |
| **VULN-05** | Lack of Webhook Idempotency (Replay) | A04: Insecure Design | **HIGH** | **RESOLVED** | MEDIUM |
| **VULN-06** | Insecure Admin Authentication (PIN in URL) | A07: Auth & ID Failures | **CRITICAL** | **RESOLVED** | CRITICAL |
| **VULN-07** | Non-Atomic Inventory Race Conditions | A04: Insecure Design | **HIGH** | **RESOLVED** | MEDIUM |
| **VULN-08** | Disclosed Default Admin Credentials | A07: Auth & ID Failures | **HIGH** | **RESOLVED** | MEDIUM |
| **VULN-09** | Order ID Collision Risk | A04: Insecure Design | **MEDIUM** | **RESOLVED** | LOW |
| **VULN-10** | Unverified Return URL Processing | A08: Software & Data Integrity | **HIGH** | **RESOLVED** | MEDIUM |
| **VULN-11** | Fictitious Seed Orders in Production | A08: Software & Data Integrity | **MEDIUM** | **RESOLVED** | LOW |
| **VULN-12** | False Marketing Claims (PayPal / Unsent Email)| A04: Insecure Design | **MEDIUM** | **RESOLVED** | LOW |

---

## 3. DEEP-DIVE VULNERABILITY PROOFS & REMEDIATION

### Vulnerability 1: Client-Controlled Pricing in `api/checkout.js`
* **Vulnerability Type:** CWE-472: External Control of Assumed-Immutable Web Parameter
* **Exploit Scenario:**
  ```bash
  curl -X POST https://offdahook.vercel.app/api/checkout \
    -H "Content-Type: application/json" \
    -d '{
      "items": [{
        "id": "fully-loaded-regrowth-system",
        "title": "Fully Loaded Regrowth System",
        "price": "0.01",
        "quantity": 1
      }]
    }'
  ```
  The server took `Math.round(parseFloat(item.price) * 100)` directly from `req.body` and instructed Stripe to charge 1 cent for a $100.00 formula bundle.
* **Remediation:** Complete decoupling. The server now queries the Supabase `products` table using the provided `id`, extracts the authoritative `price` stored in PostgreSQL, and ignores whatever `price` the client sent.

### Vulnerability 2: Fake Client Confirmation Modal on Gateway Failure
* **Vulnerability Type:** CWE-1025: Comparison Using Wrong Factors (Client-Side State Illusion)
* **Exploit Scenario:**
  If Stripe environment variables were absent or the network failed, `main.js` caught the error and invoked `showCheckoutModal()`, creating an order in `localStorage` marked `"Paid (Stripe / PayPal)"` with $0 captured, giving the customer a false confirmation modal.
* **Remediation:** Removed client-side fallback order creation. Any checkout initiation failure triggers a clear, dignified error message directing the client to retry or phone the salon.

### Vulnerability 3: Missing Row Level Security on Supabase Tables
* **Vulnerability Type:** CWE-284: Improper Access Control
* **Exploit Scenario:**
  Because RLS was disabled on the `orders` and `products` tables, any actor with the public Supabase anon key could execute:
  ```javascript
  const { data } = await supabase.from('orders').select('*');
  ```
  This dumped all customer names, phone numbers, and physical home addresses to the browser console.
* **Remediation:** Enabled RLS on all tables in `schema.sql`. Restricted all `orders` reads and writes strictly to the `service_role` key (Vercel serverless backend only). Public anon key has read-only access to active `products` and zero access to customer orders.

### Vulnerability 4: Webhook Raw Body Signature Bypass on Vercel
* **Vulnerability Type:** CWE-347: Improper Verification of Cryptographic Signature
* **Exploit Scenario:**
  Vercel automatically parses incoming request bodies as JSON objects. Passing a JSON object to `stripe.webhooks.constructEvent()` causes an immediate signature verification failure. Furthermore, the previous handler fell back to unverified `req.body` if `STRIPE_WEBHOOK_SECRET` was undefined.
* **Remediation:**
  1. Configured `{ api: { bodyParser: false } }` on the Vercel function.
  2. Implemented stream chunk buffering to read the exact raw `Buffer`.
  3. Enforced strict signature verification with zero unverified fallbacks.

### Vulnerability 5: Webhook Idempotency & Replay Protection
* **Vulnerability Type:** CWE-799: Improper Control of Interaction Frequency
* **Exploit Scenario:**
  Stripe guarantees *at-least-once* delivery for webhooks. If Vercel timed out or returned HTTP 500, Stripe retried the webhook. The previous code unconditionally inserted a new order and decremented stock every time the webhook fired.
* **Remediation:**
  1. Created `webhook_events` table in PostgreSQL.
  2. Implemented pre-check on `stripe_session_id` in `orders` and `webhook_events`.
  3. Duplicate webhook deliveries return HTTP 200 immediately without re-deducting stock.

### Vulnerability 6: Insecure Admin Authentication
* **Vulnerability Type:** CWE-306: Missing Authentication for Critical Function
* **Exploit Scenario:**
  Authentication was checked solely in client-side JavaScript (`sessionStorage.getItem('odh_admin_auth') === 'true'`). Sensitive API routes accepted plaintext PINs in URL query strings (`/api/orders?pin=offdahook2026`), leaking credentials into access logs, browser history, and proxy servers.
* **Remediation:**
  1. Removed plaintext PIN from URL parameters.
  2. Implemented timing-safe authorization verification via `Authorization: Bearer <ADMIN_SECRET>` header.
  3. Removed default hardcoded credentials.

### Vulnerability 7: Non-Atomic Stock Race Conditions
* **Vulnerability Type:** CWE-362: Concurrent Execution using Shared Resource with Improper Synchronization
* **Exploit Scenario:**
  When two customers attempted to buy the last unit simultaneously, both read `stock = 1`, both paid Stripe, and stock went to negative or oversold.
* **Remediation:**
  1. Implemented `deduct_product_stock_atomic(product_id, quantity)` stored procedure in PostgreSQL with conditional update:
     `UPDATE products SET stock = stock - quantity WHERE id = p_id AND stock >= quantity`.
  2. Added table constraint: `CHECK (stock >= 0)`.

---

## 4. VERIFICATION OF SECURITY POSTURE

Following the implementation of all security controls:
1. **Zero Client Price Spoofing:** Server validates all prices against PostgreSQL.
2. **Zero PII Exposure:** Supabase RLS locks all customer orders to serverless `service_role`.
3. **Zero Phantom Orders:** Orders exist only when verified by cryptographic Stripe webhook.
4. **Zero Double Deductions:** Webhook idempotency protects against retry race conditions.
5. **Zero Leaked Keys:** Frontend builds contain zero secret tokens or service keys.

