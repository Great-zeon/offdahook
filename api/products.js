// ========================================================================
// OFF DA HOOK SALON SUITES - HARDENED PRODUCTS & INVENTORY API (VERCEL SERVERLESS)
// Cryptographic Token Verification for Catalog & Stock Modifications
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./auth');
const { applySecureCors } = require('./_payment-validation');
const fs = require('fs');
const path = require('path');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  applySecureCors(req, res, 'GET, POST, PUT, DELETE, OPTIONS', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Helper: Secure Cryptographic Session Token Verification
  const isAuthorized = () => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

    const token = authHeader.substring(7).trim();
    const masterPin = process.env.ADMIN_PIN;
    if (!masterPin) return false;

    return verifyToken(token, masterPin) !== null;
  };

  try {
    // GET: Fetch all products with authoritative stock (Public Access)
    if (req.method === 'GET') {
      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('title', { ascending: true });
        
        if (error) {
          console.error('Supabase products fetch error:', error);
          throw error;
        }
        return res.status(200).json({ success: true, products: data });
      }

      // Catalog file fallback if database is offline
      const filePath = path.join(process.cwd(), 'assets', 'shop', 'products.json');
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const prods = JSON.parse(fileData).map(p => ({
          id: p.id,
          title: p.title,
          price: parseFloat((p.price || '0').replace(/[^0-9.]/g, '')),
          stock: p.stock || 12,
          category: p.category,
          volume: p.volume,
          image: p.mainImage || p.image,
          description: p.description
        }));
        return res.status(200).json({ success: true, products: prods });
      }

      return res.status(503).json({ success: false, error: 'Product catalog unavailable' });
    }

    // PUT: Update stock quantity or product details (Restricted to Admin)
    if (req.method === 'PUT') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
      }

      const { id, stock, price, title, category, description } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service unavailable' });
      }

      const updates = { updated_at: new Date().toISOString() };
      if (typeof stock !== 'undefined') updates.stock = Math.max(0, parseInt(stock, 10));
      if (typeof price !== 'undefined') updates.price = Math.max(0, parseFloat(price));
      if (title) updates.title = title;
      if (category) updates.category = category;
      if (description) updates.description = description;

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      return res.status(200).json({ success: true, product: data[0] });
    }

    // POST: Add new product (Restricted to Admin)
    if (req.method === 'POST') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
      }

      const { id, title, price, stock, category, volume, image, description } = req.body;
      if (!title || typeof price === 'undefined') {
        return res.status(400).json({ success: false, error: 'Title and price are required' });
      }

      const prodId = id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service unavailable' });
      }

      const { data, error } = await supabase
        .from('products')
        .insert([{
          id: prodId,
          title,
          price: parseFloat(price),
          stock: Math.max(0, parseInt(stock, 10) || 10),
          category: category || 'general',
          volume: volume || 'Standard Size',
          image: image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg',
          description: description || ''
        }])
        .select();

      if (error) throw error;
      return res.status(201).json({ success: true, product: data[0] });
    }

    // DELETE: Archive product (Restricted to Admin)
    if (req.method === 'DELETE') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
      }

      const { id } = req.body || req.query;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service unavailable' });
      }

      const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Product archived successfully' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Products API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
