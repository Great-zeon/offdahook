-- ========================================================================
-- OFF DA HOOK SALON SUITES - PRODUCTION DATABASE SCHEMA (SECOND-ROUND REMEDIATION)
-- PostgreSQL / Supabase Schema with Row Level Security & Atomic Concurrency
-- Fully Idempotent Migration Script: Safe to execute on new or existing DBs
-- Second-Round Remediation Corrections:
--   1. Durable Webhook Failure Logging: Independent procedure 'record_webhook_failure'
--      records failures outside the rolled-back order transaction.
--   2. Precise Unique Constraint Handling: Dissects constraint name via
--      GET STACKED DIAGNOSTICS. Non-session collisions (e.g. order ID) are NOT treated as duplicates.
--   3. Individual Item Quantity Validation: Every raw item is validated for positive integer
--      bounds (1-10000) BEFORE aggregation; negative and decimal quantities are strictly rejected.
--   4. Deterministic Deadlock Prevention: Multi-item product row locks acquired in alphabetical order.
--   5. Idempotent Migration Safety: Safely verifies and creates unique index on stripe_session_id
--      without dropping data or silently skipping constraint application.
--   6. Merchant Notification Audit Columns: Tracks merchant alert status directly in orders table.
-- ========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------
-- 1. Products & Inventory Table
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  stock INTEGER NOT NULL DEFAULT 10,
  category TEXT,
  volume TEXT,
  image TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure non-negative stock and price constraints
ALTER TABLE products DROP CONSTRAINT IF EXISTS check_stock_non_negative;
ALTER TABLE products ADD CONSTRAINT check_stock_non_negative CHECK (stock >= 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS check_price_non_negative;
ALTER TABLE products ADD CONSTRAINT check_price_non_negative CHECK (price >= 0);

-- ------------------------------------------------------------------------
-- 2. Customer Orders Table
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL DEFAULT 'Paid',
  payment_method TEXT NOT NULL DEFAULT 'Stripe',
  fulfillment_status TEXT NOT NULL DEFAULT 'Pending',
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  email_receipt_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_status TEXT NOT NULL DEFAULT 'pending',
  resend_id TEXT,
  email_last_error TEXT,
  email_sent_at TIMESTAMPTZ,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  merchant_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
  merchant_alert_status TEXT NOT NULL DEFAULT 'pending',
  merchant_alert_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotently add missing columns to existing orders table if it already exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_receipt_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resend_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_last_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_alert_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_alert_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Safe Unique Index Migration for stripe_session_id on existing databases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'orders' AND indexname = 'idx_orders_stripe_session_uniq'
  ) THEN
    -- Check for existing duplicate session IDs
    IF EXISTS (
      SELECT stripe_session_id 
      FROM orders 
      WHERE stripe_session_id IS NOT NULL 
      GROUP BY stripe_session_id 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE WARNING 'CRITICAL: Duplicate non-null stripe_session_id values detected in orders. Unique index creation deferred until manual deduplication.';
    ELSE
      CREATE UNIQUE INDEX idx_orders_stripe_session_uniq ON orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment_status);

-- ------------------------------------------------------------------------
-- 3. Webhook Idempotency & Distributed Lock Table
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT
);

ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_webhook_events_session ON webhook_events(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);

-- ------------------------------------------------------------------------
-- 4. Dedicated Stored Procedure: Record Webhook Failure Durably
-- Executed outside the rolled-back order transaction to guarantee failure observability
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_webhook_failure(
  p_event_id TEXT,
  p_session_id TEXT,
  p_event_type TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RETURN;
  END IF;

  INSERT INTO webhook_events (
    id, stripe_session_id, event_type, status, received_at, last_attempt_at, attempt_count, last_error
  ) VALUES (
    p_event_id, p_session_id, COALESCE(p_event_type, 'checkout.session.completed'), 'failed', NOW(), NOW(), 1, p_error
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'failed',
    last_error = p_error,
    last_attempt_at = NOW(),
    attempt_count = webhook_events.attempt_count + 1;
END;
$$;

-- ------------------------------------------------------------------------
-- 5. Corrected Unified Atomic Order & Inventory Transaction Procedure
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_paid_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_event_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_item JSONB;
  v_item RECORD;
  v_prod RECORD;
  v_order_id TEXT;
  v_stripe_session_id TEXT;
  v_existing_order_id TEXT;
  v_existing_event RECORD;
  v_has_shortfall BOOLEAN := FALSE;
  v_shortfall_items JSONB := '[]'::jsonb;
  v_constraint_name TEXT;
  v_qty_numeric NUMERIC;
BEGIN
  -- ======================================================================
  -- A. Input Validation
  -- ======================================================================
  IF p_order IS NULL OR jsonb_typeof(p_order) != 'object' THEN
    RAISE EXCEPTION 'p_order must be a valid JSON object';
  END IF;

  v_order_id := p_order->>'id';
  IF v_order_id IS NULL OR btrim(v_order_id) = '' THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  v_stripe_session_id := p_order->>'stripe_session_id';
  IF v_stripe_session_id IS NULL OR btrim(v_stripe_session_id) = '' THEN
    RAISE EXCEPTION 'Stripe Session ID is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array';
  END IF;

  -- ======================================================================
  -- B. Individual Item Validation (BEFORE Aggregation)
  -- Strictly rejects missing, negative, decimal, or overflow quantities
  -- ======================================================================
  FOR v_raw_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF v_raw_item IS NULL OR jsonb_typeof(v_raw_item) != 'object' THEN
      RAISE EXCEPTION 'Every item in p_items must be a valid JSON object';
    END IF;

    IF v_raw_item->>'id' IS NULL OR btrim(v_raw_item->>'id') = '' THEN
      RAISE EXCEPTION 'Order item is missing required product ID';
    END IF;

    IF v_raw_item->'qty' IS NULL OR jsonb_typeof(v_raw_item->'qty') != 'number' THEN
      RAISE EXCEPTION 'Order item % has missing or non-numeric quantity', v_raw_item->>'id';
    END IF;

    v_qty_numeric := (v_raw_item->>'qty')::NUMERIC;

    IF v_qty_numeric <= 0 THEN
      RAISE EXCEPTION 'Order item % has non-positive quantity: %', v_raw_item->>'id', v_qty_numeric;
    END IF;

    IF v_qty_numeric != floor(v_qty_numeric) THEN
      RAISE EXCEPTION 'Order item % has non-integer quantity: %', v_raw_item->>'id', v_qty_numeric;
    END IF;

    IF v_qty_numeric > 10000 THEN
      RAISE EXCEPTION 'Order item % quantity exceeds maximum allowable threshold (10000): %', v_raw_item->>'id', v_qty_numeric;
    END IF;
  END LOOP;

  -- ======================================================================
  -- C. Idempotency Check via Stripe Session ID
  -- ======================================================================
  SELECT id INTO v_existing_order_id
  FROM orders
  WHERE stripe_session_id = v_stripe_session_id
  LIMIT 1;

  IF v_existing_order_id IS NOT NULL THEN
    IF p_event_id IS NOT NULL AND btrim(p_event_id) != '' THEN
      INSERT INTO webhook_events (id, stripe_session_id, event_type, status, processed_at, last_attempt_at, attempt_count)
      VALUES (p_event_id, v_stripe_session_id, COALESCE(p_order->>'event_type', 'checkout.session.completed'), 'completed', NOW(), NOW(), 1)
      ON CONFLICT (id) DO UPDATE SET
        status = 'completed',
        processed_at = NOW(),
        last_attempt_at = NOW();
    END IF;

    RETURN jsonb_build_object(
      'success', FALSE,
      'duplicate', TRUE,
      'order_id', v_existing_order_id,
      'message', 'Order for this Stripe checkout session has already been processed.'
    );
  END IF;

  -- ======================================================================
  -- D. Webhook Event Lock & Lifecycle State
  -- ======================================================================
  IF p_event_id IS NOT NULL AND btrim(p_event_id) != '' THEN
    SELECT * INTO v_existing_event
    FROM webhook_events
    WHERE id = p_event_id
    LIMIT 1;

    IF v_existing_event.id IS NOT NULL THEN
      IF v_existing_event.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'duplicate', TRUE,
          'message', 'Webhook event has already been completed.'
        );
      ELSIF v_existing_event.status = 'processing' AND v_existing_event.last_attempt_at > NOW() - INTERVAL '30 seconds' THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'in_flight', TRUE,
          'message', 'Webhook event is currently being processed by another worker.'
        );
      ELSE
        UPDATE webhook_events
        SET attempt_count = attempt_count + 1,
            last_attempt_at = NOW(),
            status = 'processing'
        WHERE id = p_event_id;
      END IF;
    ELSE
      INSERT INTO webhook_events (id, stripe_session_id, event_type, status, received_at, last_attempt_at, attempt_count)
      VALUES (p_event_id, v_stripe_session_id, COALESCE(p_order->>'event_type', 'checkout.session.completed'), 'processing', NOW(), NOW(), 1);
    END IF;
  END IF;

  -- ======================================================================
  -- E. Deterministic Row-Locking & Stock Availability Pre-Check
  -- Locks rows in alphabetical ORDER BY id to eliminate concurrent deadlocks
  -- ======================================================================
  FOR v_item IN
    SELECT x.id, SUM(x.qty)::INT AS total_qty
    FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty INT)
    GROUP BY x.id
    ORDER BY x.id ASC -- Deterministic deadlock prevention
  LOOP
    SELECT id, title, price, stock, is_active
    INTO v_prod
    FROM products
    WHERE id = v_item.id
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'Product % does not exist in salon catalog', v_item.id;
    END IF;

    IF v_prod.is_active = FALSE THEN
      RAISE EXCEPTION 'Product % (%) is currently inactive', v_item.id, v_prod.title;
    END IF;

    IF v_prod.stock < v_item.total_qty THEN
      v_has_shortfall := TRUE;
      v_shortfall_items := v_shortfall_items || jsonb_build_object(
        'product_id', v_item.id,
        'title', v_prod.title,
        'requested_qty', v_item.total_qty,
        'available_stock', v_prod.stock
      );
    END IF;
  END LOOP;

  -- ======================================================================
  -- F. Inventory Shortfall Exception Handling
  -- Customer paid on Stripe. Zero stock is deducted (eliminates partial deductions).
  -- Order is safely stored as 'Backordered_Action_Required' for merchant intervention.
  -- ======================================================================
  IF v_has_shortfall THEN
    INSERT INTO orders (
      id, stripe_session_id, customer_name, customer_email,
      customer_phone, shipping_address, items, subtotal,
      total_amount, payment_status, payment_method, fulfillment_status,
      email_receipt_sent, email_status, email_last_error, created_at, updated_at
    ) VALUES (
      v_order_id,
      v_stripe_session_id,
      COALESCE(p_order->>'customer_name', 'Crown Client'),
      COALESCE(p_order->>'customer_email', ''),
      p_order->>'customer_phone',
      (p_order->'shipping_address')::jsonb,
      p_items,
      COALESCE((p_order->>'subtotal')::numeric, 0.00),
      COALESCE((p_order->>'total_amount')::numeric, 0.00),
      'Paid',
      COALESCE(p_order->>'payment_method', 'Stripe'),
      'Backordered_Action_Required',
      FALSE,
      'pending',
      'Inventory shortfall detected during processing. Flagged for merchant fulfillment or refund.',
      NOW(),
      NOW()
    );

    IF p_event_id IS NOT NULL AND btrim(p_event_id) != '' THEN
      UPDATE webhook_events
      SET status = 'action_required',
          processed_at = NOW(),
          last_error = 'Inventory shortfall: flagged for merchant action'
      WHERE id = p_event_id;
    END IF;

    RETURN jsonb_build_object(
      'success', FALSE,
      'action_required', TRUE,
      'error_code', 'INVENTORY_SHORTFALL',
      'order_id', v_order_id,
      'shortfall_details', v_shortfall_items,
      'message', 'Payment verified but stock is insufficient. Order flagged for merchant action.'
    );
  END IF;

  -- ======================================================================
  -- G. Atomic Deduction & Order Insertion (Happy Path)
  -- ======================================================================
  FOR v_item IN
    SELECT x.id, SUM(x.qty)::INT AS total_qty
    FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty INT)
    GROUP BY x.id
    ORDER BY x.id ASC
  LOOP
    UPDATE products
    SET stock = stock - v_item.total_qty,
        updated_at = NOW()
    WHERE id = v_item.id;
  END LOOP;

  INSERT INTO orders (
    id, stripe_session_id, customer_name, customer_email,
    customer_phone, shipping_address, items, subtotal,
    total_amount, payment_status, payment_method, fulfillment_status,
    email_receipt_sent, email_status, created_at, updated_at
  ) VALUES (
    v_order_id,
    v_stripe_session_id,
    COALESCE(p_order->>'customer_name', 'Crown Client'),
    COALESCE(p_order->>'customer_email', ''),
    p_order->>'customer_phone',
    (p_order->'shipping_address')::jsonb,
    p_items,
    COALESCE((p_order->>'subtotal')::numeric, 0.00),
    COALESCE((p_order->>'total_amount')::numeric, 0.00),
    'Paid',
    COALESCE(p_order->>'payment_method', 'Stripe'),
    'Pending',
    FALSE,
    'pending',
    NOW(),
    NOW()
  );

  IF p_event_id IS NOT NULL AND btrim(p_event_id) != '' THEN
    UPDATE webhook_events
    SET status = 'completed',
        processed_at = NOW(),
        last_error = NULL
    WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'stock_deducted', TRUE
  );

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

    -- Only classify as duplicate if violation is specifically on stripe_session_id
    IF v_constraint_name ILIKE '%stripe_session%' THEN
      SELECT id INTO v_existing_order_id
      FROM orders
      WHERE stripe_session_id = v_stripe_session_id
      LIMIT 1;

      IF v_existing_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'duplicate', TRUE,
          'order_id', v_existing_order_id,
          'message', 'Order for this Stripe session already exists.'
        );
      END IF;
    END IF;

    IF v_constraint_name ILIKE '%webhook_events%' THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'duplicate', TRUE,
        'message', 'Webhook event ID has already been recorded.'
      );
    END IF;

    -- Non-session collision (e.g. order ID primary key collision) is a true error
    RAISE EXCEPTION 'Unique constraint collision on %: not a verified duplicate payment.', v_constraint_name;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'process_paid_order_atomic failed: %', SQLERRM;
END;
$$;

-- ------------------------------------------------------------------------
-- 6. Individual Stock Deduction Procedure
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_product_stock_atomic(p_id TEXT, p_quantity INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  UPDATE products
  SET stock = stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_id AND stock >= p_quantity AND is_active = TRUE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ------------------------------------------------------------------------
-- 7. Function Execution Permissions (SECURITY DEFINER Hardening)
-- Revoke PUBLIC/anon/authenticated execution; grant exclusively to service_role
-- ------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION record_webhook_failure(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_webhook_failure(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION process_paid_order_atomic(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_paid_order_atomic(JSONB, JSONB, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION deduct_product_stock_atomic(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deduct_product_stock_atomic(TEXT, INTEGER) TO service_role;

-- ------------------------------------------------------------------------
-- 8. Row Level Security Policies
-- ------------------------------------------------------------------------
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role full access products" ON products;
CREATE POLICY "Service role full access products" ON products
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access orders" ON orders;
CREATE POLICY "Service role full access orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access webhook_events" ON webhook_events;
CREATE POLICY "Service role full access webhook_events" ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------------------
-- 9. Catalog Seed Data (Preserves Existing Records via ON CONFLICT)
-- ------------------------------------------------------------------------
INSERT INTO products (id, title, price, stock, category, volume, image, description)
VALUES
  ('loc-buffet-bundle-package', 'Loc Buffet Bundle Package', 99.99, 12, 'locs bundles', '5-Piece Set + Satin Bonnet', 'assets/shop/loc-buffet-bundle-package-enhanced.jpg', 'Complete maintenance suite: Shampoo, Conditioner, Aloe Rose Spritzer, Loc Butta Sauce, Xxxtra Regrowth Serum, and Luxury Satin Bonnet.'),
  ('xxxtra-strength-regrowth-serum', 'Xxxtra Strength Regrowth Serum', 25.00, 24, 'regrowth', '4 oz Dropper', 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg', 'High-potency botanical infusion engineered to awaken dormant follicles along thinning edges, temples, and crown areas.'),
  ('anti-itch-dandruff-growth-serum', 'Anti Itch Dandruff Growth Serum', 20.00, 18, 'regrowth locs', '4 oz Dropper', 'assets/shop/anti-itch-dandruff-growth-serum-enhanced.jpg', 'Infused with all-natural therapeutic botanicals to soothe dry, itchy, dandruff-ridden scalps.'),
  ('control-freak-edge-polish', 'ICY Edge Glaze', 20.00, 30, 'edges styling', '4 oz Jar', 'assets/shop/control-freak-edge-polish-enhanced.jpg', 'Non-flaking, water-resistant formula engineered to sculpt edges and lay down coarse, resistant hair.'),
  ('grip-and-glide-braid-jam', 'Grip and Glide Braid Jam', 15.00, 20, 'braids locs', '8 oz Jar', 'assets/shop/grip-and-glide-braid-jam-enhanced.jpg', 'Extra-hold conditioning gel formulated specifically for neat parts, stitch braids, and sleek ponytail installations.'),
  ('aloe-rose-water-spritzer', 'Aloe Rose Water Spritzer', 25.00, 15, 'locs moisture', '8 oz Continuous Mist', 'assets/shop/aloe-rose-water-spritzer-enhanced.jpg', 'Refreshing daily tonic combining organic aloe barbadensis and distilled rose water.'),
  ('loc-butta-sauce', 'Loc Butta Sauce', 25.00, 14, 'locs moisture', '8 oz Jar', 'assets/shop/loc-butta-sauce-enhanced.jpg', 'Rich plant-butter souffle crafted for retwisting, palm-rolling, and sealing thirsty locs without white film.'),
  ('citrus-quench-clarifying-shampoo', 'Citrus Quench Clarifying Shampoo', 25.00, 12, 'cleansers', '8 oz Bottle', 'assets/shop/citrus-quench-clarifying-shampoo-enhanced.jpg', 'Sulfate-free chelating cleanse that lifts silicone, product residue, and hard water buildup.'),
  ('citrus-quench-hydrating-conditioner', 'Citrus Quench Hydrating Conditioner', 25.00, 12, 'cleansers', '8 oz Bottle', 'assets/shop/citrus-quench-hydrating-conditioner-enhanced.jpg', 'High-slip moisture bath enriched with botanical silk proteins for instant detangling.'),
  ('off-da-hook-oil-drip-comb', 'Off Da Hook Oil Drip Comb', 19.99, 10, 'tools', 'Precision Applicator Tool', 'assets/shop/off-da-hook-oil-drip-comb-enhanced.jpg', 'Ergonomic scalp oil dispenser with roller-ball teeth that distributes serums directly to follicles.'),
  ('the-children-s-line', 'Perfect Paige''s Unicorn Magic Hair System', 49.99, 8, 'kids bundles', 'Gentle Tear-Free Trio', 'assets/shop/the-children-s-line-enhanced.jpg', 'Ultra-gentle formulation for tender scalps and growing curls. Tear-free hydration.'),
  ('fully-loaded-regrowth-system', 'Fully Loaded Regrowth System', 100.00, 7, 'bundles regrowth', 'Comprehensive Crown Recovery Kit', 'assets/shop/fully-loaded-regrowth-system-enhanced.jpg', 'The complete professional recovery protocol for severe thinning, edges, and tension damage.')
ON CONFLICT (id) DO NOTHING;
