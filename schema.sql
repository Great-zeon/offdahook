-- ========================================================================
-- OFF DA HOOK SALON SUITES - HARDENED PRODUCTION DATABASE SCHEMA
-- PostgreSQL / Supabase Schema with Row Level Security & Atomic Concurrency
-- Fully Idempotent Migration Script: Safe to execute on new or existing DBs
-- ========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Products & Inventory Table
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

-- Ensure non-negative stock and price constraints on existing tables
ALTER TABLE products DROP CONSTRAINT IF EXISTS check_stock_non_negative;
ALTER TABLE products ADD CONSTRAINT check_stock_non_negative CHECK (stock >= 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS check_price_non_negative;
ALTER TABLE products ADD CONSTRAINT check_price_non_negative CHECK (price >= 0);

-- 2. Customer Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotently add missing columns to existing orders table if it already exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_receipt_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resend_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_last_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Create indexes for performance and fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 3. Webhook Idempotency & Distributed Lock Table
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY, -- Stripe event.id e.g. evt_...
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Unified Atomic Order & Inventory Transaction Procedure
-- Runs inside a single ACID PostgreSQL transaction.
-- Inserts the distributed lock, creates the order, and decrements stock atomically.
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
  v_item RECORD;
  v_stock_ok BOOLEAN := TRUE;
  v_order_id TEXT;
BEGIN
  v_order_id := p_order->>'id';

  -- Step 1: Distributed Lock via Webhook Event
  -- If p_event_id is provided, insert it. If duplicate, unique violation will trigger EXCEPTION.
  IF p_event_id IS NOT NULL AND p_event_id != '' THEN
    INSERT INTO webhook_events (id, event_type, processed_at)
    VALUES (p_event_id, COALESCE(p_order->>'event_type', 'checkout.session.completed'), NOW());
  END IF;

  -- Step 2: Insert Order Record
  INSERT INTO orders (
    id, stripe_session_id, customer_name, customer_email,
    customer_phone, shipping_address, items, subtotal,
    total_amount, payment_status, payment_method, fulfillment_status,
    email_receipt_sent, email_status, created_at, updated_at
  ) VALUES (
    v_order_id,
    p_order->>'stripe_session_id',
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

  -- Step 3: Atomic Stock Deduction for each purchased item
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty INT) LOOP
    IF v_item.id IS NOT NULL AND v_item.qty > 0 THEN
      UPDATE products
      SET stock = stock - v_item.qty,
          updated_at = NOW()
      WHERE id = v_item.id AND stock >= v_item.qty;

      IF NOT FOUND THEN
        v_stock_ok := FALSE;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'stock_ok', v_stock_ok
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Event or session already processed concurrently
    RETURN jsonb_build_object(
      'success', FALSE,
      'duplicate', TRUE,
      'error', 'Event or checkout session has already been processed.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

-- Individual atomic stock deduction procedure (for standalone stock adjustments)
CREATE OR REPLACE FUNCTION deduct_product_stock_atomic(p_id TEXT, p_quantity INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE products
  SET stock = stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_id AND stock >= p_quantity;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 5. Row Level Security (RLS) Policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Products Policies:
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role full access products" ON products;
CREATE POLICY "Service role full access products" ON products
  FOR ALL USING (auth.role() = 'service_role');

-- Orders Policies:
-- Isolate customer PII completely from public queries
DROP POLICY IF EXISTS "Service role full access orders" ON orders;
CREATE POLICY "Service role full access orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Webhook Events Policies:
DROP POLICY IF EXISTS "Service role full access webhook_events" ON webhook_events;
CREATE POLICY "Service role full access webhook_events" ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');

-- 6. Initial Seed Data: Off Da Hook's 12 Signature Formulas (Preserves Existing Records)
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
