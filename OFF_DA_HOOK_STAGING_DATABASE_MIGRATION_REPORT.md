# Off Da Hook Salon Suites — Staging Database Migration Report
**Date:** November 12, 2026  
**Target Artifact:** [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) (identical to [`schema.sql`](file:///Users/macos/Downloads/offdahook/schema.sql))  

---

## 1. Schema Verification & DDL Review (STATIC REVIEW: PASS)

Inspected tables, constraints, functions, and RLS policies:
- **Tables**: `products` (`track_inventory`, `is_active`, non-negative stock/price CHECK constraints), `orders` (idempotent column migrations, partial unique index `idx_orders_stripe_session_uniq`), `webhook_events`, `checkout_intents` (stores `subtotal_cents`, `shipping_cents`, `total_cents`, `status`, `expires_at`), `order_notifications` (outbox statuses: `queued`, `processing`, `accepted`, `delivered`, `bounced`, `complained`, `delayed`, `failed`, `retrying`).
- **External Reference Preservation**: Duplicate session detection executes `RAISE EXCEPTION 'MIGRATION BLOCKED: ...'` listing affected order IDs and refuses to create the unique index until manual reconciliation occurs. **Zero historical identifiers are rewritten.**
- **SECURITY DEFINER Privileges**: All 4 procedures (`record_webhook_failure`, `process_paid_order_atomic`, `deduct_product_stock_atomic`, `claim_pending_notifications`) pin `SET search_path = public, pg_temp`, revoke execution from `PUBLIC, anon, authenticated`, and grant exclusively to `service_role`.

---

## 2. Live PostgreSQL Migration Dry-Run Status (**BLOCKED**)

| Scenario | Classification | Reason |
| :--- | :---: | :--- |
| Clean Staging PostgreSQL Execution | **BLOCKED** | `psql` / `postgres` / `docker` binaries and Staging Supabase connection string are unavailable in local sandbox. Production DB (`xtdoqeoaflhvdduygndr`) untouched per policy. |
| Existing DB with Nullable `stripe_session_id` & Non-Unique Index | **BLOCKED** | Requires live staging PostgreSQL instance. |
| Existing DB with Duplicate Historical Session IDs | **BLOCKED** | Logic verified in `TC-12` (Simulated DB Logic Test); live PostgreSQL server execution requires staging DB. |
| Migration Repeatability (2nd Execution) | **BLOCKED** | Requires live staging PostgreSQL instance. |

