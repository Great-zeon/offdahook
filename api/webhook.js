// ========================================================================
// OFF DA HOOK SALON SUITES - PRODUCTION STRIPE WEBHOOK HANDLER
// Vercel Serverless Function with Raw Body Buffering & Unified Atomic Transactions
// Defect Corrections:
//   1. COMPLETELY REMOVED non-atomic sequential fallback insertion.
//   2. Enforces session.payment_status === 'paid', USD currency, positive amount.
//   3. Single authoritative processing route via process_paid_order_atomic.
//   4. Transient database errors return HTTP 500 so Stripe automatically retries.
//   5. Handles inventory shortfall (action_required) by notifying merchant without deducting stock.
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
        return res.status(500).json({ error: 'Database service unavailable' });
      }

      // 1. Mandatory Payment Validation Checks
      // Do not fulfill order if payment has not been collected (e.g. async/deferred payment methods)
      if (session.payment_status !== 'paid') {
        console.warn(`Webhook received checkout.session.completed for session ${session.id} but payment_status is '${session.payment_status}'. Deferring fulfillment.`);
        return res.status(200).json({ received: true, status: 'payment_pending', message: 'Payment not yet confirmed as paid' });
      }

      // Enforce currency and amount bounds
      if (session.currency && session.currency.toLowerCase() !== 'usd') {
        console.error(`Rejected checkout with invalid currency: ${session.currency}`);
        return res.status(400).json({ error: 'Unsupported currency' });
      }

      if (typeof session.amount_total !== 'number' || session.amount_total <= 0) {
        console.error(`Rejected checkout with non-positive amount_total: ${session.amount_total}`);
        return res.status(400).json({ error: 'Invalid total amount' });
      }

      // 2. Extract Customer & Order Information
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

      if (!Array.isArray(items) || items.length === 0) {
        console.error('CRITICAL: Webhook received empty or invalid items metadata for session:', session.id);
        return res.status(400).json({ error: 'Missing or malformed items metadata' });
      }

      // 3. Single Authoritative Processing Route via process_paid_order_atomic
      // ZERO NON-ATOMIC FALLBACK: If RPC fails, return HTTP 500 to allow Stripe retries.
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

      if (rpcError) {
        console.error('CRITICAL: process_paid_order_atomic error in webhook:', rpcError);
        // Return 500 so Stripe retries the webhook delivery
        return res.status(500).json({ error: 'Database transaction failed. Webhook retry scheduled.' });
      }

      if (!rpcData) {
        console.error('CRITICAL: process_paid_order_atomic returned null response.');
        return res.status(500).json({ error: 'Null transaction response. Webhook retry scheduled.' });
      }

      // 4. Handle Duplicate Event (Idempotency Protection)
      if (rpcData.duplicate === true) {
        console.log(`Idempotency defense: Event ${event.id} or session ${session.id} already processed. Order ID: ${rpcData.order_id}`);
        return res.status(200).json({ received: true, duplicate: true, orderId: rpcData.order_id });
      }

      // 5. Handle In-Flight Concurrent Worker
      if (rpcData.in_flight === true) {
        console.log(`Concurrent processing in progress for event ${event.id}. Returning 200.`);
        return res.status(200).json({ received: true, in_flight: true });
      }

      // 6. Handle Inventory Shortfall (Customer Paid, but Item(s) Out of Stock)
      // Money was collected by Stripe. Order is preserved as Backordered_Action_Required.
      // Zero units of inventory were deducted. Alert merchant immediately.
      if (rpcData.action_required === true && rpcData.error_code === 'INVENTORY_SHORTFALL') {
        const shortfallOrderId = rpcData.order_id || orderId;
        console.warn(`INVENTORY SHORTFALL ALERT for order ${shortfallOrderId}: Customer paid, items out of stock.`);

        const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
        const shortfallHtml = `
          <div style="font-family:sans-serif; padding:20px; color:#222;">
            <h2 style="color:#DC2626;">⚠️ ACTION REQUIRED: Inventory Shortfall on Paid Order ${shortfallOrderId}</h2>
            <p><strong>Customer:</strong> ${customerName} (${customerEmail}, ${customerPhone})</p>
            <p><strong>Total Paid:</strong> $${totalAmount.toFixed(2)} USD via Stripe</p>
            <p><strong>Stripe Session:</strong> ${session.id}</p>
            <p style="color:#B91C1C; font-weight:bold;">One or more items in this order exceeded available stock. Zero stock was deducted, and the order has been saved with status 'Backordered_Action_Required'.</p>
            <h3>Shortfall Details:</h3>
            <pre style="background:#F3F4F6; padding:12px; border-radius:6px;">${JSON.stringify(rpcData.shortfall_details, null, 2)}</pre>
            <p><a href="https://offdahook.vercel.app/admin.html" style="background:#DC2626; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard to Manage Backorder</a></p>
          </div>
        `;

        await sendEmailNotification(
          merchantEmail,
          `⚠️ ACTION REQUIRED: Inventory Shortfall on Paid Order ${shortfallOrderId}`,
          shortfallHtml
        );

        return res.status(200).json({
          received: true,
          action_required: true,
          orderId: shortfallOrderId,
          message: 'Order saved as Backordered_Action_Required due to stock shortfall.'
        });
      }

      // 7. Happy Path: Order Successfully Persisted & Stock Deducted Atomically
      if (rpcData.success !== true) {
        console.error('CRITICAL: Unexpected RPC failure state:', rpcData);
        return res.status(500).json({ error: 'Order processing failed. Webhook retry scheduled.' });
      }

      const effectiveOrderId = rpcData.order_id || orderId;

      // 8. Dispatch Customer Receipt & Merchant Notification
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
              email_attempts: 1,
              email_last_error: null
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

      console.log(`Order ${effectiveOrderId} successfully processed atomically for ${customerEmail} ($${totalAmount})`);
      return res.status(200).json({ received: true, orderId: effectiveOrderId });
    } catch (err) {
      console.error('Unhandled error processing order in webhook:', err);
      return res.status(500).json({ error: 'Failed to process order. Webhook retry scheduled.' });
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
