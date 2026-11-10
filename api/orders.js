// ========================================================================
// OFF DA HOOK SALON SUITES - HARDENED ORDERS API (VERCEL SERVERLESS)
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin, x-admin-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Helper: Secure Server-Side Authorization Verification
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    token = req.headers['x-admin-key'] || req.headers['x-admin-pin'];
  }

  const expected = process.env.ADMIN_PIN;
  if (!expected || token !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Credentials' });
  }

  try {
    // GET: Fetch all real customer orders
    if (req.method === 'GET') {
      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service unavailable' });
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error);
        throw error;
      }

      return res.status(200).json({ success: true, orders: data || [] });
    }

    // PUT: Update fulfillment status and tracking information
    if (req.method === 'PUT') {
      const { id, fulfillment_status, carrier, tracking_number, tracking_url } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing order ID' });
      }

      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service unavailable' });
      }

      const updates = { updated_at: new Date().toISOString() };
      if (fulfillment_status) updates.fulfillment_status = fulfillment_status;
      if (carrier) updates.carrier = carrier;
      if (tracking_number) updates.tracking_number = tracking_number;
      if (tracking_url) updates.tracking_url = tracking_url;

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      return res.status(200).json({ success: true, order: data[0] });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Orders API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
