// ========================================================================
// OFF DA HOOK SALON SUITES - ORDERS API (VERCEL SERVERLESS)
// ========================================================================
const { createClient } = require('@supabase/supabase-js');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify Admin PIN
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  const expected = process.env.ADMIN_PIN || 'offdahook2026';
  if (pin !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
  }

  try {
    // GET: Fetch all customer orders
    if (req.method === 'GET') {
      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ success: true, orders: data });
      }

      return res.status(200).json({ success: true, orders: [] });
    }

    // PUT: Update fulfillment status (Pending / Shipped)
    if (req.method === 'PUT') {
      const { id, fulfillment_status } = req.body;
      if (!id || !fulfillment_status) {
        return res.status(400).json({ success: false, error: 'Missing order ID or status' });
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .update({ fulfillment_status })
          .eq('id', id)
          .select();
        if (error) throw error;
        return res.status(200).json({ success: true, order: data[0] });
      }

      return res.status(200).json({ success: true, message: 'Status updated (local mode)' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Orders API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

