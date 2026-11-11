# Off Da Hook Salon Suites — Critical Defect Register
**Remediation Date**: November 11, 2026  
**Auditor**: Lead Systems & Security Architect  
**Scope**: Full Transaction Pipeline, Database Concurrency, Webhook Idempotency, Session Verification  
**Status**: REMEDIATED & CODE-VERIFIED  

---

## 1. Executive Summary

This register formally logs the critical defects identified during the adversarial review of commit `c017c1b`, records their underlying root causes, documents the exact remediation applied in code, and links to the verified test results.

---

## 2. Defect Inventory & Remediation Matrix

| Defect ID | Severity | Subsystem | Defect Description | Root Cause | Exact File Affected | Remediation Applied | Status |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **DEF-01** | **CRITICAL** | Webhook Pipeline | Non-atomic sequential fallback insertion bypassed stored procedure upon RPC failure. | Lines 171–210 of `api/webhook.js` attempted sequential order insert followed by non-atomic `deduct_product_stock_atomic` calls, ignoring stock errors. | [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js) | Completely removed the fallback block. The webhook now relies solely on `process_paid_order_atomic`. If database or RPC fails, returns HTTP 500 for Stripe retry. | **REMEDIATED** |
| **DEF-02** | **CRITICAL** | Database Concurrency | Stored procedure reported `success: true` even when inventory deduction failed. | `process_paid_order_atomic` inserted the order first, then looped through items setting `v_stock_ok := FALSE`, but returned `jsonb_build_object('success', TRUE)`. | [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) / [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) | Re-architected procedure with pre-check phase: all items row-locked via `SELECT ... FOR UPDATE`. If stock is insufficient, zero stock is deducted and order is recorded as `Backordered_Action_Required`. | **REMEDIATED** |
| **DEF-03** | **CRITICAL** | Reconciliation API | Session verification endpoint manufactured synthetic order IDs (`ODH-YYYYMMDD-XXXX`) when DB persistence failed. | Line 175 of `api/verify-session.js` fell back to generating an ID from timestamp and session suffix, returning `success: true, verified: true`. | [`api/verify-session.js`](file:///Users/macos/Downloads/offdahook/api/verify-session.js) | Purged synthetic ID generator. If payment is verified but order persistence is incomplete, returns `order_persisted: false, status: 'payment_verified_order_pending'`. | **REMEDIATED** |
| **DEF-04** | **CRITICAL** | Webhook Events | Webhook events lacked lifecycle tracking; failed operations left event state ambiguous. | `webhook_events` only had `id`, `event_type`, and `processed_at`, without tracking state (`processing`, `completed`, `failed`, `action_required`) or attempt counts. | [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) | Added `status`, `received_at`, `last_attempt_at`, `attempt_count`, and `last_error` columns. Stored procedure updates lifecycle status atomically. | **REMEDIATED** |
| **DEF-05** | **CRITICAL** | Database Security | `SECURITY DEFINER` functions were executable by `PUBLIC`, `anon`, and `authenticated` roles via PostgREST. | PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default, exposing privileged functions to client RPC calls. | [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql) | Added explicit `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;` and `GRANT EXECUTE ... TO service_role;`. | **REMEDIATED** |
| **DEF-06** | **HIGH** | Webhook Validation | Webhook processed sessions without checking `payment_status === 'paid'`, currency, or amount bounds. | Webhook assumed `checkout.session.completed` implied funds collected, risking fulfillment on async/delayed payments. | [`api/webhook.js`](file:///Users/macos/Downloads/offdahook/api/webhook.js) | Added strict guards: `session.payment_status === 'paid'`, `session.currency === 'usd'`, `session.amount_total > 0`, and non-empty items metadata. | **REMEDIATED** |
| **DEF-07** | **HIGH** | Customer Privacy | `/api/verify-session` accepted arbitrary session IDs and returned full customer order details with permissive caching. | No session ID format regex validation; customer email and details returned without masking; no `no-store` headers. | [`api/verify-session.js`](file:///Users/macos/Downloads/offdahook/api/verify-session.js) | Enforced `^cs_(test|live)_[a-zA-Z0-9]+$` regex, masked customer email (`maskEmail`), removed sensitive PII, added `Cache-Control: no-store`. | **REMEDIATED** |

