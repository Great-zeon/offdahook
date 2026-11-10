-- ========================================================================
-- OFF DA HOOK SALON SUITES - HARDENED PRODUCTION DATABASE SCHEMA
-- PostgreSQL / Supabase Schema with Row Level Security & Atomic Concurrency
-- ========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Products & Inventory Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 10 CHECK (stock >= 0),
  category TEXT,
  volume TEXT,
  image TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Customer Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'Paid',
  payment_method TEXT NOT NULL DEFAULT 'Stripe',
  fulfillment_status TEXT NOT NULL DEFAULT 'Pending',
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Webhook Idempotency & Replay Defense Table
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY, -- Stripe event.id e.g. evt_...
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Atomic Stock Deduction Stored Procedure (Concurrency-Safe)
-- Prevents race conditions and negative inventory during simultaneous checkouts
CREATE OR REPLACE FUNCTION deduct_product_stock_atomic(p_id TEXT, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Row Level Security (RLS) Policies
-- Protects customer PII and prevents unauthorized catalog modifications

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Products Policies:
-- Anonymous public users can read active products only
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

-- Service role (Vercel serverless backend) has full access
DROP POLICY IF EXISTS "Service role full access products" ON products;
CREATE POLICY "Service role full access products" ON products
  FOR ALL USING (auth.role() = 'service_role');

-- Orders Policies:
-- Strictly isolate orders from public anonymous access (prevents PII exposure)
DROP POLICY IF EXISTS "Service role full access orders" ON orders;
CREATE POLICY "Service role full access orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Webhook Events Policies:
DROP POLICY IF EXISTS "Service role full access webhook_events" ON webhook_events;
CREATE POLICY "Service role full access webhook_events" ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');

-- 6. Initial Seed Data: Off Da Hook's 12 Signature Formulas
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
