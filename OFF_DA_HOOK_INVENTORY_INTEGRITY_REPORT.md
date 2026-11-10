# OFF DA HOOK — INVENTORY INTEGRITY & CONCURRENCY REPORT
**Focus:** Race Conditions, Concurrency Protection, Atomic Deductions, and Transactional Consistency  
**Target:** Salon Formula Inventory Management (`schema.sql`, `api/checkout.js`, `api/webhook.js`)  
**Auditor:** Independent Database Reliability & Concurrency Specialist  
**Date:** November 10, 2026

---

## 1. INVENTORY SYSTEM ARCHITECTURE

Off Da Hook maintains physical inventory across 12 signature formulas at Phenix Salon Suites (Suite #192, Rosedale, NY). In e-commerce, **overselling** (selling items that do not exist physically) results in chargebacks, customer dissatisfaction, and fulfillment chaos.

### The Two-Stage Inventory Defense Architecture
1. **Stage 1: Pre-Checkout Gate (`api/checkout.js`)**
   - Non-atomic sanity check against `products.stock`.
   - Prevents a customer from entering Stripe Checkout if an item is already sold out (`stock < quantity`).
   - Does NOT reserve inventory permanently (preventing malicious shopping carts from locking stock indefinitely).
2. **Stage 2: Post-Payment Atomic Decrement (`api/webhook.js` & `schema.sql`)**
   - Executes upon verified receipt of payment from Stripe.
   - Enforces PostgreSQL row-level conditional locking.
   - Non-negative constraint `CHECK (stock >= 0)`.

---

## 2. CONCURRENCY & RACE CONDITION EVALUATION

### The "Last Available Bottle" Scenario
* **Setup:** Formula "Fully Loaded Regrowth System" has exactly `stock = 1`.
* **Scenario:** Customer A and Customer B both add the item to their bags at 12:00:00.
* **Stage 1 Behavior:**
  - Customer A clicks Checkout at 12:00:05. Server checks `stock (1) >= 1` -> Allowed. Customer A is redirected to Stripe.
  - Customer B clicks Checkout at 12:00:06. Server checks `stock (1) >= 1` -> Allowed. Customer B is redirected to Stripe.
* **Payment Race:**
  - Customer A completes Stripe payment at 12:01:00. Webhook fires.
  - Procedure `deduct_product_stock_atomic('fully-loaded-regrowth-system', 1)` executes:
    ```sql
    UPDATE products
    SET stock = stock - 1, updated_at = NOW()
    WHERE id = 'fully-loaded-regrowth-system' AND stock >= 1;
    ```
  - Stock becomes `0`. Procedure returns `TRUE`. Order ODH-A is logged as Paid and Ready to Fulfill.
  - Customer B completes Stripe payment at 12:01:02. Webhook fires.
  - Procedure `deduct_product_stock_atomic('fully-loaded-regrowth-system', 1)` executes:
    - Condition `WHERE stock >= 1` evaluates to **FALSE**.
    - No rows updated (`ROW_COUNT = 0`). Procedure returns `FALSE`.
* **Crucial Audit Finding:**
  - In commit `de9ea70`, `api/webhook.js:145-165` checked `rpcResult === true`.
  - If `rpcResult === false`, it fell back to:
    ```javascript
    if (!deducted) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', item.id).single();
      if (prod) {
        const newStock = Math.max(0, prod.stock - qty);
        await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
      }
    }
    ```
  - **DANGEROUS DEFECT IDENTIFIED:** The fallback code clobbered the atomic procedure! If `deducted` was false because stock was insufficient, the fallback forcibly set `stock = Math.max(0, prod.stock - qty)`, causing the inventory to mask an oversold condition!
  - **Correction:** When `deduct_product_stock_atomic` returns `FALSE`, the system MUST flag the order as `inventory_shortfall: true` so the salon owner Shawnese is immediately notified to blend/procure additional stock, rather than masking the error!

---

## 3. TRANSACTIONAL BOUNDARIES (ORDER + STOCK)

### Defect: Distributed Inconsistency Across HTTP Calls
Currently in `api/webhook.js`:
- Call 1: `supabase.from('orders').insert(...)`
- Call 2: `supabase.rpc('deduct_product_stock_atomic', ...)` (item 1)
- Call 3: `supabase.rpc('deduct_product_stock_atomic', ...)` (item 2)
- Call 4: `supabase.from('webhook_events').insert(...)`

If the Vercel serverless function times out or suffers a network drop between Call 1 and Call 2:
- The order is recorded in PostgreSQL.
- Stock is **NEVER deducted**.
- The webhook event is **NEVER recorded**.
- When Stripe retries the webhook, the check on `orders.stripe_session_id` sees the order already exists, skips execution, and stock remains permanently un-deducted!

### The Atomic Database Solution
We must deploy a unified PostgreSQL stored procedure `process_paid_order_atomic(p_order, p_items, p_event_id)`:
```sql
CREATE OR REPLACE FUNCTION process_paid_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_event_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_stock_ok BOOLEAN := TRUE;
BEGIN
  -- 1. Insert Webhook Event Lock (fails immediately if duplicate event)
  INSERT INTO webhook_events (id, event_type, processed_at)
  VALUES (p_event_id, 'checkout.session.completed', NOW());

  -- 2. Insert Order Record
  INSERT INTO orders (
    id, stripe_session_id, customer_name, customer_email,
    customer_phone, shipping_address, items, subtotal,
    total_amount, payment_status, payment_method, fulfillment_status
  ) VALUES (
    p_order->>'id',
    p_order->>'stripe_session_id',
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    (p_order->'shipping_address')::jsonb,
    p_items,
    (p_order->>'subtotal')::numeric,
    (p_order->>'total_amount')::numeric,
    'Paid',
    'Stripe',
    'Pending'
  );

  -- 3. Atomically Deduct Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty INT) LOOP
    UPDATE products
    SET stock = stock - v_item.qty, updated_at = NOW()
    WHERE id = v_item.id AND stock >= v_item.qty;

    IF NOT FOUND THEN
      v_stock_ok := FALSE;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', TRUE, 'stock_ok', v_stock_ok);
EXCEPTION
  WHEN unique_violation THEN
    -- Event already recorded
    RETURN jsonb_build_object('success', FALSE, 'duplicate', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This ensures that the distributed lock, the order insertion, and the inventory deductions happen in a **single ACID transaction**. Either all succeed, or none succeed!
