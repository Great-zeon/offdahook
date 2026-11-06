// ========================================================================
// OFF DA HOOK SALON SUITES - PRODUCTS & INVENTORY API (VERCEL SERVERLESS)
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Helper: Verify Admin PIN for writes
  const isAuthorized = () => {
    const pin = req.headers['x-admin-pin'] || req.body?.pin;
    const expected = process.env.ADMIN_PIN || 'offdahook2026';
    return pin === expected;
  };

  try {
    // GET: Fetch all products with stock
    if (req.method === 'GET') {
      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('title', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ success: true, products: data });
      }

      // Fallback to static catalog if Supabase is not yet connected
      const filePath = path.join(process.cwd(), 'assets', 'shop', 'products.json');
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const prods = JSON.parse(fileData).map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          numericPrice: parseFloat((p.price || '0').replace(/[^0-9.]/g, '')),
          stock: p.stock || 12,
          category: p.category,
          volume: p.volume,
          image: p.mainImage || p.image,
          description: p.description
        }));
        return res.status(200).json({ success: true, products: prods });
      }

      return res.status(200).json({ success: true, products: [] });
    }

    // PUT: Update stock quantity or product details
    if (req.method === 'PUT') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id, stock, price, title, category, description } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (supabase) {
        const updates = { updated_at: new Date().toISOString() };
        if (typeof stock !== 'undefined') updates.stock = parseInt(stock, 10);
        if (typeof price !== 'undefined') updates.price = parseFloat(price);
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

      return res.status(200).json({ success: true, message: 'Stock updated (local mode)' });
    }

    // POST: Add new product
    if (req.method === 'POST') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id, title, price, stock, category, volume, image, description } = req.body;
      if (!title || typeof price === 'undefined') {
        return res.status(400).json({ success: false, error: 'Title and price are required' });
      }

      const prodId = id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .insert([{
            id: prodId,
            title,
            price: parseFloat(price),
            stock: parseInt(stock, 10) || 10,
            category,
            volume: volume || 'Standard Size',
            image: image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg',
            description
          }])
          .select();
        if (error) throw error;
        return res.status(201).json({ success: true, product: data[0] });
      }

      return res.status(201).json({ success: true, message: 'Product created (local mode)' });
    }

    // DELETE: Delete or archive product
    if (req.method === 'DELETE') {
      if (!isAuthorized()) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
      }

      const { id } = req.body || req.query;
      if (!id) return res.status(400).json({ success: false, error: 'Missing product ID' });

      if (supabase) {
        const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Product archived' });
      }

      return res.status(200).json({ success: true, message: 'Product removed' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Products API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

