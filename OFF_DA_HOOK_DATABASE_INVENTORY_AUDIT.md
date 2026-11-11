# Off Da Hook Salon Suites — Database & Inventory Integrity Audit
**Date**: November 11, 2026  
**Auditor**: Lead Database & Concurrency Architect  
**Scope**: Supabase PostgreSQL Schema, Stored Procedures, Constraints, Row Level Security  
**Status**: AUDITED & CERTIFIED  

---

## 1. Schema & Constraint Architecture

### A. Non-Negative Integrity Constraints
```sql
ALTER TABLE products ADD CONSTRAINT check_stock_non_negative CHECK (stock >= 0);
ALTER TABLE products ADD CONSTRAINT check_price_non_negative CHECK (price >= 0);
```
These constraints prevent inventory from ever dropping below zero, even under extreme concurrent order load.

### B. Uniqueness Constraints & Indexes
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_id ON webhook_events(id);
```
Guarantees that a single Stripe Checkout session can never generate more than one order record.

---

## 2. Stored Procedure Analysis: `process_paid_order_atomic`

### A. Two-Phase Execution with Row-Level Locking
1. **Phase 1: Pre-Validation**:
   - Loops over all purchased items and locks their corresponding product rows via `SELECT ... FOR UPDATE`.
   - Validates existence, active status, and stock availability for every item.
2. **Phase 2: Execution**:
   - If ANY item is out of stock: Zero stock is deducted. The paid order is safely stored with `fulfillment_status = 'Backordered_Action_Required'`, and the merchant is alerted.
   - If ALL items are available: Stock is decremented for all items, and the order is inserted with `fulfillment_status = 'Pending'`.
   - The webhook event is marked `completed`.
3. **Atomicity Guarantee**:
   - PostgREST wraps RPC execution in an outer transaction. If an unexpected error occurs, all intermediate updates roll back completely.

---

## 3. Row Level Security & Privilege Hardening

1. **Row Level Security**:
   - `products`: Public can `SELECT` active products only. `service_role` has full access.
   - `orders`: Public access is completely denied. `service_role` has full access.
   - `webhook_events`: Public access is completely denied. `service_role` has full access.
2. **`SECURITY DEFINER` Hardening**:
   - `SET search_path = public, pg_temp` prevents path injection.
   - `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;` prevents unauthorized public RPC invocation.
   - `GRANT EXECUTE ... TO service_role;` permits serverless backend execution.

