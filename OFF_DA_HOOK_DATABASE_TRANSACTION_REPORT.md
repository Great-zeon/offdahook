# OFF DA HOOK SALON SUITES — DATABASE TRANSACTION REPORT
**Generated:** November 11, 2026  
**Files:** `schema.sql`, `OFF_DA_HOOK_CORRECTED_DATABASE_SCHEMA.sql`  
**Database Procedure:** `process_paid_order_atomic`, `record_webhook_failure`  
**Verification Target:** PostgreSQL 15+ / Supabase RPC Transaction Semantics  

---

## 1. PostgreSQL Transaction Mechanics & RPC Boundaries

In Supabase PostgreSQL, each RPC invocation executes within its own database transaction boundary.
If an unhandled exception or explicit `RAISE EXCEPTION` occurs during the execution of a PL/pgSQL function:
1. Every pending DML operation performed within that function invocation is automatically rolled back.
2. In-flight table modifications, locks, and temporary state are reverted.
3. The transaction aborts and returns an error response to the client.

### Solving the Rollback Conflict (Finding 1)
Previous implementations attempted to trap exceptions within `process_paid_order_atomic`, update `webhook_events.status = 'failed'`, and re-raise the exception. Under PostgreSQL semantics, re-raising the exception rolled back the update to `webhook_events`, wiping out the failure trace.

**Remediation**:
- The transaction boundary inside `process_paid_order_atomic` is strictly reserved for atomic order insertion and inventory decrement.
- Durable failure logging is completely decoupled into a separate standalone RPC:
  ```sql
  CREATE OR REPLACE FUNCTION record_webhook_failure(
    p_event_id TEXT,
    p_event_type TEXT,
    p_error_message TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB
  )
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    INSERT INTO webhook_events (event_id, event_type, status, error_message, payload, updated_at)
    VALUES (p_event_id, p_event_type, 'failed', p_error_message, p_payload, NOW())
    ON CONFLICT (event_id) DO UPDATE SET
      status = 'failed',
      error_message = EXCLUDED.error_message,
      updated_at = NOW();
  END;
  $$;
  ```
- When `process_paid_order_atomic` throws in Node.js, `api/webhook.js` catches the error and executes `record_webhook_failure` in a fresh, independent database call.

---

## 2. Precise Unique Constraint Discrimination (Finding 2)

Previous code trapped `WHEN unique_violation THEN` and presumed the collision was an existing Stripe session. This had the catastrophic side effect of masking primary key order ID collisions as "successful duplicates."

**Remediation**:
In `process_paid_order_atomic`:
```sql
EXCEPTION
  WHEN unique_violation THEN
    -- Inspect exact constraint name from PostgreSQL diagnostic stack
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

    -- Only orders.stripe_session_id uniqueness qualifies as idempotent duplicate
    IF v_constraint_name IN ('orders_stripe_session_id_unique', 'idx_orders_stripe_session_id') THEN
      SELECT id INTO v_existing_order_id
      FROM orders
      WHERE stripe_session_id = v_stripe_session_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', FALSE,
        'duplicate', TRUE,
        'order_id', v_existing_order_id,
        'message', 'Order already processed for this Stripe session'
      );
    ELSE
      -- Primary key or other unique constraint collision must NOT be treated as duplicate
      RAISE EXCEPTION 'Database unique constraint violation on %: rolling back transaction', v_constraint_name;
    END IF;
```

---

## 3. Concurrency Protection & Multi-Product Lock Ordering (Finding 4)

To prevent database deadlocks when multiple shoppers purchase overlapping products at the exact same millisecond:
1. Product IDs are extracted and deduplicated.
2. Product IDs are deterministically sorted in ascending alphabetical order (`ORDER BY x.id ASC`).
3. Exclusive row locks (`FOR UPDATE`) are acquired strictly in that sorted order.

```sql
SELECT ARRAY_AGG(x.id ORDER BY x.id ASC)
INTO v_sorted_product_ids
FROM (
  SELECT DISTINCT item->>'id' AS id
  FROM jsonb_array_elements(p_items) AS item
) x;

-- Deterministic lock acquisition prevents cycles across concurrent transactions
PERFORM 1 FROM products
WHERE id = ANY(v_sorted_product_ids)
ORDER BY id ASC
FOR UPDATE;
```

---

## 4. Item Quantity Validation & Pre-Aggregation Checks (Finding 3)

Before performing any inventory summation or stock deduction, every item in `p_items` is verified:
```sql
FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
LOOP
  IF v_item->>'id' IS NULL OR trim(v_item->>'id') = '' THEN
    RAISE EXCEPTION 'Invalid item: missing or empty product ID';
  END IF;
  
  -- Strict positive integer regex check
  IF v_item->>'qty' IS NULL OR (v_item->>'qty') !~ '^\d+$' THEN
    RAISE EXCEPTION 'Invalid item quantity: % must be a positive integer', v_item->>'qty';
  END IF;
  
  IF (v_item->>'qty')::INTEGER <= 0 OR (v_item->>'qty')::INTEGER > 10000 THEN
    RAISE EXCEPTION 'Invalid item quantity bounds: %', v_item->>'qty';
  END IF;
END LOOP;
```

---

## 5. Shortfall Handling: Zero Partial Deductions

If any product in the order has insufficient stock:
1. The inventory deduction loop is never entered (`v_has_shortfall` flag aborts deduction before any product is modified).
2. The order is inserted with status `fulfillment_status = 'Backordered_Action_Required'`.
3. The transaction returns `{ success: true, backordered: true }`.
4. Result: Customer payment is recorded, zero stock quantities are corrupted, and merchant dashboard flags backorder for manual action.

---

## 6. Safe & Repeatable Unique Index Migration (Operational Defect)

The migration block for `orders.stripe_session_id` handles existing duplicate records safely before attempting unique index creation:
```sql
-- Step 1: Detect any existing duplicate stripe_session_id
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT stripe_session_id
    FROM orders
    WHERE stripe_session_id IS NOT NULL
    GROUP BY stripe_session_id
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'Found % duplicate Stripe session IDs in orders table. Resolving before index creation.', v_dup_count;
    -- Disambiguate duplicate session IDs by appending order ID suffix
    UPDATE orders o
    SET stripe_session_id = o.stripe_session_id || '_dup_' || o.id
    WHERE o.id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY stripe_session_id ORDER BY created_at ASC) as rn
        FROM orders
        WHERE stripe_session_id IS NOT NULL
      ) ranked WHERE rn > 1
    );
  END IF;
END $$;

-- Step 2: Idempotent Unique Index Creation
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique
ON orders (stripe_session_id)
WHERE stripe_session_id IS NOT NULL;
```
