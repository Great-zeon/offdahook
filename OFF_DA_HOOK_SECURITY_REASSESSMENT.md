# OFF DA HOOK — SECURITY REASSESSMENT & ADVERSARIAL AUDIT
**Subject:** Security Posture Evaluation of Commit `de9ea70`  
**Evaluation Standard:** OWASP Top 10 (2021), CIS Benchmark, NIST SP 800-63B Authentication Guidelines  
**Classification:** Confidential Defensive Security Audit  
**Auditor:** Independent Lead Application Security Engineer  
**Date:** November 10, 2026

---

## 1. CRITICAL VULNERABILITY: INSECURE ADMIN TOKEN HANDLING

### Vulnerability Identification (SEC-ADV-01)
* **Location:** [`api/orders.js:20-30`](file:///Users/macos/Downloads/offdahook/api/orders.js#L20-L30), [`api/products.js:25-33`](file:///Users/macos/Downloads/offdahook/api/products.js#L25-L33), [`admin.html:1150-1185`](file:///Users/macos/Downloads/offdahook/admin.html#L1150-L1185)
* **Vulnerability Class:** CWE-287: Improper Authentication & CWE-384: Session Fixation / Missing Expiration
* **Severity:** **CRITICAL**

### The Attack Vector
In commit `de9ea70`, the admin authentication check is implemented as:
```javascript
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }
  const expected = process.env.ADMIN_PIN;
  if (!expected || token !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Credentials' });
  }
```
In `admin.html`:
```javascript
sessionStorage.setItem('odh_admin_token', enteredPin);
```

### Exploit Scenarios
1. **Zero Session Expiration:** The "token" is literally the plaintext administrative PIN. It never expires. If an administrator leaves their browser open or logs in on a tablet at the salon, anyone with physical access can read the token from `sessionStorage` or inspect network traffic.
2. **Brute Force Vulnerability:** There is zero rate-limiting on `/api/orders` or `/api/products`. An attacker can run a simple bash loop testing 4-digit or 6-digit PINs against `GET /api/orders` at 50 requests/second. A 4-digit PIN (10,000 combinations) is cracked in under 4 minutes.
3. **No Logout Invalidation:** When the administrator clicks "Logout", `sessionStorage.removeItem('odh_admin_token')` is executed client-side. The server has no concept of a session being revoked. Any copies of the token remain perpetually valid.

### Mandatory Hardening Architecture: Cryptographic Session Authentication
1. **Dedicated Auth Route (`/api/auth/login`):**
   - Implements IP rate limiting (maximum 5 failed attempts per 15 minutes).
   - Validates the PIN using timing-safe string comparison (`crypto.timingSafeEqual`) to prevent side-channel timing attacks.
   - Generates a cryptographically signed HMAC-SHA256 session token containing:
     ```json
     {
       "role": "admin",
       "exp": 1731289200000,
       "iat": 1731260400000
     }
     ```
   - Sets session TTL to 8 hours (standard retail workday).
2. **Protected Route Validation:**
   - Serverless APIs decode and verify the HMAC signature of incoming Bearer tokens using an internal server secret.
   - Reject any token where `Date.now() > payload.exp`.

---

## 2. SUPABASE ROW LEVEL SECURITY (RLS) AUDIT

### Analysis of `schema.sql` Policies
* **`products` Table:**
  ```sql
  CREATE POLICY "Public can view active products" ON products
    FOR SELECT USING (is_active = true);
  CREATE POLICY "Service role full access products" ON products
    FOR ALL USING (auth.role() = 'service_role');
  ```
  - **Verdict:** SECURE. Anonymous users can only `SELECT` items with `is_active = true`. Modifications require `service_role`.
* **`orders` Table:**
  ```sql
  CREATE POLICY "Service role full access orders" ON orders
    FOR ALL USING (auth.role() = 'service_role');
  ```
  - **Verdict:** SECURE. Anonymous public users have ZERO access (neither `SELECT`, `INSERT`, nor `UPDATE`). All customer PII (home addresses, phone numbers, email addresses) is shielded from client-side network queries.
* **`webhook_events` Table:**
  ```sql
  CREATE POLICY "Service role full access webhook_events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');
  ```
  - **Verdict:** SECURE. Restricted to `service_role`.

### Critical Migration Warning: `schema.sql` Defect on Existing Tables
Because the script uses `CREATE TABLE IF NOT EXISTS`, if tables were created during earlier prototype runs, PostgreSQL **does not alter existing tables**.
- The `CHECK (stock >= 0)` constraint is **NOT applied** to existing tables.
- The new `carrier` and `tracking_number` columns are **NOT added** to existing tables.
- **Remediation:** Provide an idempotent migration script using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `ALTER TABLE ... ADD CONSTRAINT`.

---

## 3. OWASP TOP 10 (2021) REASSESSMENT

| Vulnerability Category | Prototype Status | Commit `de9ea70` | Post-Audit Status | Residual Risk |
| :--- | :---: | :---: | :---: | :---: |
| **A01: Broken Access Control** | FAIL (Public RLS) | PASS (RLS Enabled) | **PASS (RLS Enforced)** | LOW |
| **A02: Cryptographic Failures** | FAIL (Weak Keys) | PASS (Secrets Hidden) | **PASS** | LOW |
| **A03: Injection** | PASS (Parameterized) | PASS (Parameterized) | **PASS** | LOW |
| **A04: Insecure Design** | FAIL (Client Pricing) | PASS (Server Pricing) | **PASS** | LOW |
| **A05: Security Misconfiguration** | FAIL (Default PIN) | PASS (Env Var PIN) | **PASS** | LOW |
| **A06: Vulnerable Components** | PASS | PASS | **PASS** | LOW |
| **A07: Identification & Auth Failures** | FAIL (Client Gate) | **FAIL (Plaintext Token)** | **REMEDIATING (HMAC Token)** | CRITICAL |
| **A08: Software & Data Integrity** | FAIL (Fake Orders) | PASS (Purged Modals) | **PASS** | LOW |
| **A09: Security Logging & Monitoring** | FAIL (None) | PASS (Webhook Logging) | **PASS** | LOW |
| **A10: Server-Side Request Forgery** | PASS | PASS | **PASS** | LOW |
