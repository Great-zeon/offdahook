# Off Da Hook Salon Suites — Comprehensive Security & Threat Audit
**Date**: November 11, 2026  
**Auditor**: Lead Application Security Architect  
**Scope**: Authentication, Authorization, API Endpoints, Secrets Exposure, CORS, Injection  
**Status**: AUDITED & SECURED  

---

## 1. Vulnerability Assessment Across OWASP Top 10

| Vulnerability Category | Risk Assessed | Architectural Mitigation | Status |
| :--- | :--- | :--- | :---: |
| **A01: Broken Access Control** | Unauthorized access to customer orders | Orders protected by Row Level Security in DB; `/api/orders` requires Bearer HMAC token | **PASS** |
| **A02: Cryptographic Failures** | Secret key leakage in client bundles | Zero secret keys (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PIN`) in frontend assets | **PASS** |
| **A03: Injection** | SQL injection in order creation | Parameterized queries via Supabase SDK; strict JSON typing and PL/pgSQL type-casting | **PASS** |
| **A04: Insecure Design** | Webhook replaying or race condition | Cryptographic raw body HMAC signature; atomic row-level locks on inventory; unique constraints | **PASS** |
| **A05: Security Misconfiguration** | Permissive RPC execution in PostgreSQL | Search path pinned to `public, pg_temp`; execution revoked from `PUBLIC`, `anon`, `authenticated` | **PASS** |
| **A06: Vulnerable Components** | Outdated third-party packages | Minimal dependencies (`stripe`, `@supabase/supabase-js`); zero extraneous packages | **PASS** |
| **A07: Identification & Auth Failures** | Admin PIN brute-forcing | Constant-time string comparison (`timingSafeEqual`); HMAC-SHA256 tokens with 8h expiration | **PASS** |
| **A08: Software & Data Integrity** | Client price modification | Server ignores client prices; all prices fetched server-side from database | **PASS** |
| **A09: Logging & Monitoring Failures** | Unaudited email or payment failures | Delivery states and error messages logged to `orders` and `webhook_events` | **PASS** |
| **A10: Server-Side Request Forgery** | Malicious webhook endpoints | Webhook URL hardcoded to internal handler; Resend API target hardcoded to `api.resend.com` | **PASS** |

---

## 2. Admin Authentication Details (`api/auth.js`)

1. **Timing-Attack Resistance**:
   ```javascript
   function safeCompare(a, b) {
     if (typeof a !== 'string' || typeof b !== 'string') return false;
     const bufA = Buffer.from(a);
     const bufB = Buffer.from(b);
     if (bufA.length !== bufB.length) return false;
     return crypto.timingSafeEqual(bufA, bufB);
   }
   ```
2. **HMAC Session Tokens**:
   - Payload: `{ role: 'admin', iat: timestamp, exp: timestamp + 8h }`.
   - Signed using `crypto.createHmac('sha256', ADMIN_PIN)`.
   - Tampered payloads or expired timestamps are rejected with HTTP 401.
3. **Serverless Rate Limiting Boundary**:
   - `loginAttempts = new Map()` operates within individual container lifecycles.
   - Transparently documented: Container recycling resets in-memory counts. Brute-force protection relies primarily on high-entropy master PINs and constant-time comparisons.
