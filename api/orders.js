// ========================================================================
// OFF DA HOOK SALON SUITES - HARDENED ORDERS API (VERCEL SERVERLESS)
// Cryptographic Token Verification, Fulfillment Tracking & Receipt Management
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./auth');
const https = require('https');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Helper: Dispatch Email via Resend
async function sendResendEmail(to, subject, htmlContent) {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY is not defined in environment variables' };
  }

  const payload = JSON.stringify({
    from: 'Off Da Hook Salon Suites <orders@offdahookhairsalon.com>',
    to: [to],
    subject: subject,
    html: htmlContent
  });

  return new Promise((resolve) => {
    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, id: parsed.id });
          } else {
            resolve({ success: false, error: parsed.message || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300, error: data || `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Cryptographic Session Token Verification
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing session token' });
  }

  const token = authHeader.substring(7).trim();
  const masterPin = process.env.ADMIN_PIN;

  if (!masterPin) {
    return res.status(503).json({ success: false, error: 'Admin authentication is not configured on the server' });
  }

  const verifiedSession = verifyToken(token, masterPin);
  if (!verifiedSession) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
  }

  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database service unavailable' });
    }

    // GET: Fetch all real customer orders
    if (req.method === 'GET') {
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

    // PUT: Update fulfillment status, tracking information, or resend receipt
    if (req.method === 'PUT') {
      const { id, fulfillment_status, carrier, tracking_number, tracking_url, action } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing order ID' });
      }

      // Action: Resend Receipt to Customer
      if (action === 'resend_receipt') {
        const { data: order, error: fetchErr } = await supabase
          .from('orders')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchErr || !order) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }

        if (!order.customer_email) {
          return res.status(400).json({ success: false, error: 'No customer email on file' });
        }

        const itemsHtml = (order.items || []).map(i => `
          <tr>
            <td style="padding:8px 0; border-bottom:1px solid #2A2536; color:#FFFFFF;">${i.title} &times; ${i.qty || i.quantity || 1}</td>
            <td style="padding:8px 0; border-bottom:1px solid #2A2536; text-align:right; color:#FF539B; font-weight:bold;">$${((i.price || 0) * (i.qty || i.quantity || 1)).toFixed(2)}</td>
          </tr>
        `).join('');

        const receiptHtml = `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#0F0B15; color:#F0EEF8; padding:32px; border-radius:8px; max-width:600px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:24px;">
              <h1 style="color:#FF539B; margin:0; font-size:24px; letter-spacing:1px;">OFF DA HOOK SALON SUITES</h1>
              <p style="color:#A39EB2; font-size:12px; margin-top:4px;">Rosedale, NY • Phenix Salon Suites Suite #192</p>
            </div>
            <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:20px; margin-bottom:20px;">
              <h2 style="color:#FFFFFF; margin-top:0; font-size:18px;">Crown Order Receipt: ${order.id}</h2>
              <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:14px;">
                <tbody>${itemsHtml}</tbody>
              </table>
              <div style="display:flex; justify-content:space-between; margin-top:16px; padding-top:12px; border-top:2px solid #362E48; font-size:16px; font-weight:bold;">
                <span>Total Paid</span>
                <span style="color:#FF539B;">$${parseFloat(order.total_amount || 0).toFixed(2)} USD</span>
              </div>
            </div>
            ${order.tracking_number ? `<p style="font-size:13px; color:#34D399;"><strong>Shipment Carrier:</strong> ${order.carrier || 'USPS'} • <strong>Tracking:</strong> ${order.tracking_number}</p>` : ''}
          </div>
        `;

        const emailResult = await sendResendEmail(
          order.customer_email,
          `Crown Order Receipt: ${order.id} — Off Da Hook Salon Suites`,
          receiptHtml
        );

        if (emailResult.success) {
          await supabase.from('orders').update({
            email_receipt_sent: true,
            email_status: 'sent',
            resend_id: emailResult.id || null,
            email_sent_at: new Date().toISOString(),
            email_attempts: (order.email_attempts || 0) + 1,
            email_last_error: null
          }).eq('id', id);
          return res.status(200).json({ success: true, message: 'Receipt dispatched successfully' });
        } else {
          await supabase.from('orders').update({
            email_status: 'failed',
            email_last_error: emailResult.error || 'Delivery failed',
            email_attempts: (order.email_attempts || 0) + 1
          }).eq('id', id);
          return res.status(500).json({ success: false, error: `Email delivery failed: ${emailResult.error || 'Unknown error'}. Verify RESEND_API_KEY in Vercel.` });
        }
      }

      // Standard Status & Tracking Update
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
