# Off Da Hook Salon Suites — Database Function Security & Privilege Audit
**Date**: November 11, 2026  
**Auditor**: Lead Database & Security Architect  
**Scope**: PostgreSQL Stored Procedures, `SECURITY DEFINER` Privileges, Role-Based Access Control  
**Status**: AUDITED & SECURED  

---

## 1. Overview of `SECURITY DEFINER` Privileges in Supabase

In PostgreSQL, a stored procedure declared as `SECURITY DEFINER` executes with the elevated privileges of the role that owns the function (in Supabase, `postgres` or `supabase_admin`). 

Without strict access control, declaring a function as `SECURITY DEFINER` in the `public` schema creates severe vulnerabilities:
1. **Search Path Hijacking**: If `search_path` is mutable, an unprivileged user can create a malicious table (e.g. `public.orders`) and trick the privileged function into writing to or reading from it.
2. **Public RPC Execution**: By default, PostgreSQL grants `EXECUTE` on newly created functions to the pseudo-role `PUBLIC`. Through PostgREST, any anonymous website visitor could theoretically invoke `supabase.rpc('process_paid_order_atomic', ...)` directly using the browser's public anon key.

---

## 2. Hardening Measures Implemented

### A. Explicit `search_path` Pinning
Both `process_paid_order_atomic` and `deduct_product_stock_atomic` specify:
```sql
SECURITY DEFINER
SET search_path = public, pg_temp
```
This freezes the schema resolution path to `public` and temporary session tables, eliminating search-path substitution attacks.

### B. Revocation of Untrusted Execution Privileges
The migration script [`OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`](file:///Users/macos/Downloads/offdahook/OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql) applies explicit revocation:
```sql
REVOKE EXECUTE ON FUNCTION process_paid_order_atomic(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_paid_order_atomic(JSONB, JSONB, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION deduct_product_stock_atomic(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deduct_product_stock_atomic(TEXT, INTEGER) TO service_role;
```

### C. Access Control Matrix

| Database Role | Permitted Access to `products` | Permitted Access to `orders` | Permitted Access to `process_paid_order_atomic` | Permitted Access to `deduct_product_stock_atomic` |
| :--- | :--- | :--- | :--- | :--- |
| **`anon` (Storefront Public)** | `SELECT` (active products only) | **NONE (DENIED by RLS)** | **DENIED (Revoked)** | **DENIED (Revoked)** |
| **`authenticated` (Client Auth)** | `SELECT` (active products only) | **NONE (DENIED by RLS)** | **DENIED (Revoked)** | **DENIED (Revoked)** |
| **`service_role` (Backend Lambdas)** | `ALL` (Bypasses RLS) | `ALL` (Bypasses RLS) | **ALLOWED (`EXECUTE`)** | **ALLOWED (`EXECUTE`)** |

---

## 3. Concurrency Protection & Row-Level Locking

Inside `process_paid_order_atomic`, inventory checks are executed using row-level exclusive locks:
```sql
SELECT id, title, price, stock, is_active
INTO v_prod
FROM products
WHERE id = v_item.id
FOR UPDATE;
```
When two customer orders for the same formula execute concurrently, the second transaction blocks at `SELECT ... FOR UPDATE` until the first transaction commits or rolls back. This eliminates race conditions, double-spending, and inventory overselling.
