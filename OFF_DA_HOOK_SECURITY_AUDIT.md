# Off Da Hook Salon Suites — Application Security Audit
**Date:** November 12, 2026  
**Scope:** Full Repository (`api/*.js`, `schema.sql`, `main.js`, `admin.html`, `shop.html`, `.env.example`)  

---

## 1. Security Verification Ledger (Static & Direct Source Audit)

| Security Requirement | Audit Finding & Evidence | Status |
| :--- | :--- | :---: |
| Hardcoded secrets check (`sk_live`, `sk_test`, `whsec_`, `re_`, service keys) | Grep across `api/*.js`, `main.js`, `admin.html`, `shop.html`: 0 exposed secrets found. Placeholder demo PIN in `.env.example` replaced cleanly. | **PASS** (Static) |
| CORS allowlisting | Zero wildcard `Access-Control-Allow-Origin: *` across all `api/*.js` routes; shared `applySecureCors` checks `ALLOWED_ORIGINS` (`TC-55`). Note: direct server-to-server calls remain gated by Bearer Auth/HMAC. | **PASS** (Static) |
| Admin authentication (`api/auth.js`) | Timing-safe HMAC-SHA256 tokens with 8h TTL (`SESSION_TTL_MS`), IP lockout rate limiting (`MAX_ATTEMPTS = 5`), `typeof pin === 'string'` type guard (`TC-63`). | **PASS** (Static) |
| Protected admin & retry mutations | `api/orders.js`, `api/products.js` (`PUT`/`POST`/`DELETE`), and `api/notifications-retry.js` enforce `verifyToken(token, masterPin)` (`TC-35`, `TC-46`, `TC-55`). | **PASS** (Static) |
| Checkout redirect URL validation | Arbitrary `Origin` headers fall back to `process.env.STOREFRONT_URL || 'https://offdahook.vercel.app'` (`TC-20`, `TC-21`, `TC-44`). | **PASS** (Unit / Static) |
| XSS / HTML injection prevention | `escapeHtml` applied across email templates (`_notification-outbox.js`, `orders.js`), admin tables/modals (`admin.html`), and client confirmation modal (`main.js`) (`TC-31`, `TC-61`). | **PASS** (Unit / Static) |
| SQL `SECURITY DEFINER` hardening | All 4 functions pin `search_path = public, pg_temp` and revoke execution from `PUBLIC, anon, authenticated`. | **PASS** (Static) |
| RLS on Supabase tables | RLS enabled on `products` (public SELECT on `is_active = true` only), `orders`, `webhook_events`, `checkout_intents`, `order_notifications` (`service_role` full access). | **PASS** (Static) |
| Live penetration / RLS enforcement test against Supabase | Requires deployed Supabase staging project. | **BLOCKED** |
