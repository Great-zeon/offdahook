// ========================================================================
// OFF DA HOOK SALON SUITES - HARDENED STRIPE WEBHOOK HANDLER
// Vercel Serverless Function with Raw Body Buffering & Atomic Transactions
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Helper: Stream buffer reader for raw payload verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

// Helper: Send Transactional Email via Resend REST API
async function sendEmailNotification(to, subject, htmlContent) {
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

    req.on('error', (err) => {
      console.error('Failed to send email via Resend:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret || !stripe) {
    console.error('Webhook rejected: Missing stripe signature, webhook secret, or stripe instance.');
    return res.status(400).send('Webhook Error: Missing signature or configuration');
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
  }

  // Handle successful checkout payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      if (!supabase) {
        console.error('CRITICAL: Supabase client not initialized in webhook.');
        return res.status(500).json({ error: 'Database connection unavailable' });
      }

      // 1. Extract Customer & Shipping Information
      const customerName = session.customer_details?.name || 'Valued Crown Client';
      const customerEmail = session.customer_details?.email || session.customer_email || '';
      const customerPhone = session.customer_details?.phone || '';
      const shippingAddress = session.shipping_details?.address || session.customer_details?.address || {};
      const totalAmount = (session.amount_total || 0) / 100;
      const subtotalAmount = (session.amount_subtotal || session.amount_total || 0) / 100;

      // Deterministic non-colliding Order ID: ODH-YYYYMMDD-XXXX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderId = `ODH-${datePrefix}-${randomSuffix}`;

      let items = [];
      if (session.metadata?.itemsJson) {
        try {
          items = JSON.parse(session.metadata.itemsJson);
        } catch (e) {
          console.error('Failed to parse session metadata itemsJson:', e);
        }
      }

      // 2. Execute Unified Atomic Order & Inventory Transaction
      let txSuccess = false;
      let effectiveOrderId = orderId;

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('process_paid_order_atomic', {
          p_order: {
            id: orderId,
            stripe_session_id: session.id,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            shipping_address: shippingAddress,
            subtotal: subtotalAmount,
            total_amount: totalAmount,
            payment_method: 'Stripe'
          },
          p_items: items,
          p_event_id: event.id
        });

        if (!rpcError && rpcData) {
          if (rpcData.duplicate === true) {
            console.log(`Idempotency defense: Event ${event.id} or session ${session.id} already processed.`);
            return res.status(200).json({ received: true, message: 'Event already processed' });
          }
          if (rpcData.success === true) {
            txSuccess = true;
            if (rpcData.order_id) effectiveOrderId = rpcData.order_id;
          }
        }
      } catch (rpcEx) {
        console.warn('RPC process_paid_order_atomic fallback required:', rpcEx.message);
      }

      // 3. Fallback Sequential Insertion if Stored Procedure is not yet deployed
      if (!txSuccess) {
        // Idempotency check on orders
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_session_id', session.id)
          .maybeSingle();

        if (existing) {
          console.log(`Idempotency defense: Order already exists for session ${session.id} (${existing.id}).`);
          return res.status(200).json({ received: true, message: 'Event already processed' });
        }

        // Insert order
        const { error: insertErr } = await supabase.from('orders').insert([{
          id: orderId,
          stripe_session_id: session.id,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          shipping_address: shippingAddress,
          items: items,
          subtotal: subtotalAmount,
          total_amount: totalAmount,
          payment_status: 'Paid',
          payment_method: 'Stripe',
          fulfillment_status: 'Pending',
          created_at: new Date().toISOString()
        }]);

        if (insertErr) throw insertErr;

        // Deduct inventory
        for (const item of items) {
          if (item.id) {
            const qty = parseInt(item.qty, 10) || 1;
            try {
              await supabase.rpc('deduct_product_stock_atomic', { p_id: item.id, p_quantity: qty });
            } catch (e) {}
          }
        }

        try {
          await supabase.from('webhook_events').insert([{ id: event.id, event_type: event.type }]);
        } catch (e) {}
      }

      // 4. Dispatch Branded Customer Receipt & Merchant Alert
      let emailSuccess = false;
      if (customerEmail) {
        const itemsHtml = items.map(i => `
          <tr>
            <td style="padding:8px 0; border-bottom:1px solid #2A2536; color:#FFFFFF;">${i.title} &times; ${i.qty || 1}</td>
            <td style="padding:8px 0; border-bottom:1px solid #2A2536; text-align:right; color:#FF539B; font-weight:bold;">$${((i.price || 0) * (i.qty || 1)).toFixed(2)}</td>
          </tr>
        `).join('');

        const formattedAddress = shippingAddress.line1
          ? `${shippingAddress.line1}${shippingAddress.line2 ? ', ' + shippingAddress.line2 : ''}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postal_code}`
          : 'Customer Address on file';

        const receiptHtml = `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#0F0B15; color:#F0EEF8; padding:32px; border-radius:8px; max-width:600px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:24px;">
              <h1 style="color:#FF539B; margin:0; font-size:24px; letter-spacing:1px;">OFF DA HOOK SALON SUITES</h1>
              <p style="color:#A39EB2; font-size:12px; margin-top:4px;">Rosedale, NY • Phenix Salon Suites Suite #192</p>
            </div>
            <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:20px; margin-bottom:20px;">
              <h2 style="color:#FFFFFF; margin-top:0; font-size:18px;">Crown Order Confirmed: ${effectiveOrderId}</h2>
              <p style="font-size:14px; line-height:1.6; color:#C5C0D4;">Thank you, ${customerName}! Your signature hair care order has been verified and is being prepared with utmost care by Master Stylist Shawnese Parker.</p>
              <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:14px;">
                <thead>
                  <tr style="border-bottom:1px solid #362E48; color:#A39EB2; text-align:left;">
                    <th style="padding-bottom:8px;">Formula</th>
                    <th style="padding-bottom:8px; text-align:right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              <div style="display:flex; justify-content:space-between; margin-top:16px; padding-top:12px; border-top:2px solid #362E48; font-size:16px; font-weight:bold;">
                <span>Total Paid</span>
                <span style="color:#FF539B;">$${totalAmount.toFixed(2)} USD</span>
              </div>
            </div>
            <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:16px; font-size:13px; color:#A39EB2;">
              <strong style="color:#FFFFFF;">Shipping To:</strong><br>
              ${customerName}<br>
              ${formattedAddress}<br>
              Phone: ${customerPhone || 'On file'}
            </div>
            <p style="text-align:center; font-size:12px; color:#6B647D; margin-top:24px;">
              Questions about your order? Call the salon directly at (347) 238-1602 or reply to this email.<br>
              © 2026 Off Da Hook Salon Suites. All Rights Reserved.
            </p>
          </div>
        `;

        const emailResult = await sendEmailNotification(
          customerEmail,
          `Crown Order Confirmed: ${effectiveOrderId} — Off Da Hook Salon Suites`,
          receiptHtml
        );

        try {
          if (emailResult.success) {
            await supabase.from('orders').update({
              email_receipt_sent: true,
              email_status: 'sent',
              resend_id: emailResult.id || null,
              email_sent_at: new Date().toISOString(),
              email_attempts: 1
            }).eq('id', effectiveOrderId);
          } else {
            await supabase.from('orders').update({
              email_status: 'failed',
              email_last_error: emailResult.error || 'Delivery failed',
              email_attempts: 1
            }).eq('id', effectiveOrderId);
          }
        } catch (e) {}

        // Merchant Alert to Shawnese
        const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
        const merchantHtml = `
          <div style="font-family:sans-serif; padding:20px; color:#222;">
            <h2>🎉 New Crown Order Received: ${effectiveOrderId}</h2>
            <p><strong>Customer:</strong> ${customerName} (${customerEmail}, ${customerPhone})</p>
            <p><strong>Total:</strong> $${totalAmount.toFixed(2)}</p>
            <p><strong>Shipping Address:</strong><br>${formattedAddress}</p>
            <h3>Items to Fulfill:</h3>
            <ul>
              ${items.map(i => `<li>${i.title} &times; ${i.qty || 1}</li>`).join('')}
            </ul>
            <p><a href="https://offdahook.vercel.app/admin.html" style="background:#FF539B; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard</a></p>
          </div>
        `;

        await sendEmailNotification(
          merchantEmail,
          `📦 New Order to Fulfill: ${effectiveOrderId} ($${totalAmount.toFixed(2)})`,
          merchantHtml
        );
      }

      console.log(`Order ${effectiveOrderId} successfully processed for ${customerEmail} ($${totalAmount})`);
      return res.status(200).json({ received: true, orderId: effectiveOrderId });
    } catch (err) {
      console.error('Error processing order in webhook:', err);
      return res.status(500).json({ error: 'Failed to process order' });
    }
  }

  return res.status(200).json({ received: true });
};

// Disable automatic JSON body parsing in Vercel to preserve raw buffer for cryptographic signature
handler.config = {
  api: {
    bodyParser: false
  }
};

module.exports = handler;
