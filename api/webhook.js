// ========================================================================
// OFF DA HOOK SALON SUITES - PRODUCTION STRIPE WEBHOOK HANDLER
// Vercel Serverless Function with Raw Body Buffering & Unified Atomic Transactions
// Second-Round Remediation Corrections:
//   1. Durable Webhook Failure Logging: Calls record_webhook_failure RPC on error.
//   2. Collision-Resistant Order IDs: Generates crypto.randomBytes(4) hex suffixes.
//   3. Strict Shared Payment Validation: Enforces exact currency, bounds, and item checks.
//   4. Asynchronous Event Support: Handles checkout.session.async_payment_succeeded and failed.
//   5. Merchant Alert Independence: Merchant notification dispatched even if customer email missing.
//   6. HTML Injection Defense: Escapes all dynamic customer and formula fields in email templates.
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const crypto = require('crypto');
const { validateStripeSession, escapeHtml } = require('./_payment-validation');

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

  // Handle asynchronous payment failure
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    console.warn(`Asynchronous payment failed for session: ${session.id}`);

    if (supabase) {
      try {
        await supabase.rpc('record_webhook_failure', {
          p_event_id: event.id,
          p_session_id: session.id,
          p_event_type: event.type,
          p_error: 'Asynchronous payment failed or was declined by issuing institution'
        });
      } catch (e) {}
    }

    const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
    await sendEmailNotification(
      merchantEmail,
      `⚠️ Payment Failed for Session: ${escapeHtml(session.id)}`,
      `<p>An asynchronous payment attempt failed for Stripe session <strong>${escapeHtml(session.id)}</strong>. No order was fulfilled.</p>`
    );

    return res.status(200).json({ received: true, status: 'async_payment_failed' });
  }

  // Handle successful checkout payments (both immediate and asynchronous)
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;

    try {
      if (!supabase) {
        console.error('CRITICAL: Supabase client not initialized in webhook.');
        return res.status(500).json({ error: 'Database service unavailable' });
      }

      // 1. Authoritative Shared Payment Validation
      let validatedSession;
      try {
        validatedSession = validateStripeSession(session);
      } catch (valErr) {
        // If payment is pending on a completed event, defer fulfillment safely
        if (valErr.code === 'PAYMENT_NOT_PAID') {
          console.warn(`Payment status '${session.payment_status}' for session ${session.id}. Deferring fulfillment until async payment succeeds.`);
          return res.status(200).json({ received: true, status: 'payment_pending' });
        }

        console.error(`Session validation rejected: ${valErr.message}`);
        // Record failure in webhook_events
        try {
          await supabase.rpc('record_webhook_failure', {
            p_event_id: event.id,
            p_session_id: session.id || 'unknown',
            p_event_type: event.type,
            p_error: valErr.message
          });
        } catch (e) {}

        return res.status(400).json({ error: valErr.message, code: valErr.code });
      }

      // 2. Extract Customer & Order Information
      const customerName = session.customer_details?.name || 'Valued Crown Client';
      const customerEmail = session.customer_details?.email || session.customer_email || '';
      const customerPhone = session.customer_details?.phone || '';
      const shippingAddress = session.shipping_details?.address || session.customer_details?.address || {};
      const totalAmount = validatedSession.amountTotalDollars;
      const subtotalAmount = (session.amount_subtotal || session.amount_total || 0) / 100;
      const items = validatedSession.items;

      // Cryptographically Collision-Resistant Order ID: ODH-YYYYMMDD-8HEX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const secureSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const orderId = `ODH-${datePrefix}-${secureSuffix}`;

      // 3. Single Authoritative Processing Route via process_paid_order_atomic
      let rpcData;
      let rpcError;

      try {
        const result = await supabase.rpc('process_paid_order_atomic', {
          p_order: {
            id: orderId,
            stripe_session_id: session.id,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            shipping_address: shippingAddress,
            subtotal: subtotalAmount,
            total_amount: totalAmount,
            payment_method: 'Stripe',
            event_type: event.type
          },
          p_items: items,
          p_event_id: event.id
        });

        rpcData = result.data;
        rpcError = result.error;
      } catch (txEx) {
        rpcError = txEx;
      }

      // If atomic procedure fails, log durably in separate transaction and return HTTP 500
      if (rpcError || !rpcData) {
        const errMsg = rpcError?.message || 'Null transaction response';
        console.error('CRITICAL: process_paid_order_atomic transaction failure:', errMsg);

        try {
          await supabase.rpc('record_webhook_failure', {
            p_event_id: event.id,
            p_session_id: session.id,
            p_event_type: event.type,
            p_error: errMsg
          });
        } catch (logErr) {
          console.error('CRITICAL: record_webhook_failure failed:', logErr.message);
        }

        return res.status(500).json({ error: 'Database transaction failed. Webhook retry scheduled.' });
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
      if (rpcData.action_required === true && rpcData.error_code === 'INVENTORY_SHORTFALL') {
        const shortfallOrderId = rpcData.order_id || orderId;
        console.warn(`INVENTORY SHORTFALL ALERT for order ${shortfallOrderId}: Customer paid, items out of stock.`);

        const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
        const shortfallHtml = `
          <div style="font-family:sans-serif; padding:20px; color:#222;">
            <h2 style="color:#DC2626;">⚠️ ACTION REQUIRED: Inventory Shortfall on Paid Order ${escapeHtml(shortfallOrderId)}</h2>
            <p><strong>Customer:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail)}, ${escapeHtml(customerPhone)})</p>
            <p><strong>Total Paid:</strong> $${totalAmount.toFixed(2)} USD via Stripe</p>
            <p><strong>Stripe Session:</strong> ${escapeHtml(session.id)}</p>
            <p style="color:#B91C1C; font-weight:bold;">One or more items exceeded available stock. Zero stock was deducted, and the order has been preserved with status 'Backordered_Action_Required'.</p>
            <h3>Shortfall Details:</h3>
            <pre style="background:#F3F4F6; padding:12px; border-radius:6px;">${escapeHtml(JSON.stringify(rpcData.shortfall_details, null, 2))}</pre>
            <p><a href="https://offdahook.vercel.app/admin.html" style="background:#DC2626; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard to Manage Backorder</a></p>
          </div>
        `;

        const merchantAlertRes = await sendEmailNotification(
          merchantEmail,
          `⚠️ ACTION REQUIRED: Inventory Shortfall on Paid Order ${shortfallOrderId}`,
          shortfallHtml
        );

        try {
          await supabase.from('orders').update({
            merchant_alert_sent: merchantAlertRes.success,
            merchant_alert_status: merchantAlertRes.success ? 'sent' : 'failed',
            merchant_alert_error: merchantAlertRes.error || null
          }).eq('id', shortfallOrderId);
        } catch (e) {}

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
        try {
          await supabase.rpc('record_webhook_failure', {
            p_event_id: event.id,
            p_session_id: session.id,
            p_event_type: event.type,
            p_error: rpcData.error || 'Unexpected transaction result'
          });
        } catch (e) {}
        return res.status(500).json({ error: 'Order processing failed. Webhook retry scheduled.' });
      }

      const effectiveOrderId = rpcData.order_id || orderId;

      // 8. Dispatch Customer Receipt (if email provided)
      const itemsHtml = items.map(i => `
        <tr>
          <td style="padding:8px 0; border-bottom:1px solid #2A2536; color:#FFFFFF;">${escapeHtml(i.title)} &times; ${i.qty || 1}</td>
          <td style="padding:8px 0; border-bottom:1px solid #2A2536; text-align:right; color:#FF539B; font-weight:bold;">$${((Number(i.price) || 0) * (Number(i.qty) || 1)).toFixed(2)}</td>
        </tr>
      `).join('');

      const formattedAddress = shippingAddress.line1
        ? `${escapeHtml(shippingAddress.line1)}${shippingAddress.line2 ? ', ' + escapeHtml(shippingAddress.line2) : ''}, ${escapeHtml(shippingAddress.city)}, ${escapeHtml(shippingAddress.state)} ${escapeHtml(shippingAddress.postal_code)}`
        : 'Customer Address on file';

      if (customerEmail) {
        const receiptHtml = `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#0F0B15; color:#F0EEF8; padding:32px; border-radius:8px; max-width:600px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:24px;">
              <h1 style="color:#FF539B; margin:0; font-size:24px; letter-spacing:1px;">OFF DA HOOK SALON SUITES</h1>
              <p style="color:#A39EB2; font-size:12px; margin-top:4px;">Rosedale, NY • Phenix Salon Suites Suite #192</p>
            </div>
            <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:20px; margin-bottom:20px;">
              <h2 style="color:#FFFFFF; margin-top:0; font-size:18px;">Crown Order Confirmed: ${escapeHtml(effectiveOrderId)}</h2>
              <p style="font-size:14px; line-height:1.6; color:#C5C0D4;">Thank you, ${escapeHtml(customerName)}! Your signature hair care order has been verified and is being prepared with utmost care by Master Stylist Shawnese Parker.</p>
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
              ${escapeHtml(customerName)}<br>
              ${formattedAddress}<br>
              Phone: ${escapeHtml(customerPhone || 'On file')}
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
      }

      // 9. Merchant Alert Dispatched INDEPENDENTLY of Customer Email
      const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
      const merchantHtml = `
        <div style="font-family:sans-serif; padding:20px; color:#222;">
          <h2>🎉 New Crown Order Received: ${escapeHtml(effectiveOrderId)}</h2>
          <p><strong>Customer:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail || 'No email provided')}, ${escapeHtml(customerPhone || 'No phone')})</p>
          <p><strong>Total:</strong> $${totalAmount.toFixed(2)} USD</p>
          <p><strong>Shipping Address:</strong><br>${formattedAddress}</p>
          <h3>Items to Fulfill:</h3>
          <ul>
            ${items.map(i => `<li>${escapeHtml(i.title)} &times; ${i.qty || 1}</li>`).join('')}
          </ul>
          <p><a href="https://offdahook.vercel.app/admin.html" style="background:#FF539B; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard</a></p>
        </div>
      `;

      const merchantAlertResult = await sendEmailNotification(
        merchantEmail,
        `📦 New Order to Fulfill: ${effectiveOrderId} ($${totalAmount.toFixed(2)})`,
        merchantHtml
      );

      try {
        await supabase.from('orders').update({
          merchant_alert_sent: merchantAlertResult.success,
          merchant_alert_status: merchantAlertResult.success ? 'sent' : 'failed',
          merchant_alert_error: merchantAlertResult.error || null
        }).eq('id', effectiveOrderId);
      } catch (e) {}

      console.log(`Order ${effectiveOrderId} successfully processed atomically for ${customerEmail || 'client'} ($${totalAmount})`);
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
