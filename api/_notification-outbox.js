// ========================================================================
// OFF DA HOOK SALON SUITES - DURABLE NOTIFICATION OUTBOX DISPATCHER
// Guarantees reliable, retryable merchant alerts and customer receipts
// ========================================================================
const https = require('https');
const { escapeHtml } = require('./_payment-validation');

const EMAIL_TIMEOUT_MS = 10000; // 10 second network timeout for outbound emails

/**
 * Sanitize error messages before persisting to database
 */
function sanitizeErrorMessage(err) {
  if (!err) return 'Unknown notification dispatch error';
  const msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
  return msg
    .replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED_RESEND_KEY]')
    .replace(/sk_(test|live)_[a-zA-Z0-9]+/g, '[REDACTED_STRIPE_KEY]')
    .slice(0, 500);
}

/**
 * Send an email via native HTTPS call to Resend REST API with strict timeout & Idempotency-Key
 */
function sendEmailViaResendRest(to, subject, htmlBody, idempotencyKey = null) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return resolve({ success: false, error: 'RESEND_API_KEY is not configured in environment' });
    }

    const payload = JSON.stringify({
      from: 'Off Da Hook Salon Suites <orders@offdahookhairsalon.com>',
      to: [to],
      subject: subject,
      html: htmlBody
    });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    let isDone = false;

    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (isDone) return;
        isDone = true;
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, id: parsed.id || null });
          } else {
            resolve({ success: false, error: parsed.message || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300, error: data || `HTTP ${res.statusCode}` });
        }
      });
    });

    req.setTimeout(EMAIL_TIMEOUT_MS, () => {
      if (isDone) return;
      isDone = true;
      req.destroy();
      resolve({ success: false, error: `Resend HTTP request timed out after ${EMAIL_TIMEOUT_MS}ms` });
    });

    req.on('error', (err) => {
      if (isDone) return;
      isDone = true;
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Atomically claims pending/retrying/stale-processing notifications using PostgreSQL FOR UPDATE SKIP LOCKED.
 */
async function claimNotifications(supabase, orderId = null, limit = 20) {
  const { data: claimed, error: rpcErr } = await supabase.rpc('claim_pending_notifications', {
    p_order_id: orderId,
    p_limit: limit
  });

  if (!rpcErr && Array.isArray(claimed)) {
    return claimed;
  }

  // Fallback atomic optimistic claim if RPC hasn't been compiled yet
  let query = supabase
    .from('order_notifications')
    .select('*')
    .in('status', ['queued', 'retrying'])
    .limit(limit);
  if (orderId) query = query.eq('order_id', orderId);

  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) return [];

  const claimedRows = [];
  for (const row of candidates) {
    const { data: updatedRow } = await supabase
      .from('order_notifications')
      .update({
        status: 'processing',
        attempt_count: (row.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', row.id)
      .in('status', ['queued', 'retrying'])
      .select()
      .maybeSingle();

    if (updatedRow) claimedRows.push(updatedRow);
  }
  return claimedRows;
}

/**
 * Processes a single claimed notification row
 */
async function processClaimedNotification(supabase, notif) {
  const attemptNum = notif.attempt_count || 1;
  const idempotencyKey = `notif-${notif.id}-attempt-${attemptNum}`;
  const sendResult = await sendEmailViaResendRest(notif.recipient, notif.subject, notif.html_body, idempotencyKey);

  if (sendResult.success) {
    // Provider accepted request (note: distinct from 'delivered', which arrives via Resend webhook)
    await supabase
      .from('order_notifications')
      .update({
        status: 'accepted',
        provider_message_id: sendResult.id || null,
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', notif.id);

    if (notif.notification_type.startsWith('merchant')) {
      await supabase.from('orders').update({
        merchant_alert_sent: true,
        merchant_alert_status: 'accepted',
        merchant_alert_error: null
      }).eq('id', notif.order_id);
    } else {
      await supabase.from('orders').update({
        email_receipt_sent: true,
        email_status: 'accepted',
        resend_id: sendResult.id || null,
        email_sent_at: new Date().toISOString(),
        email_last_error: null
      }).eq('id', notif.order_id);
    }

    return { id: notif.id, order_id: notif.order_id, status: 'accepted', providerMessageId: sendResult.id };
  }

  const sanitizedErr = sanitizeErrorMessage(sendResult.error);
  const isPermanentFailure = attemptNum >= (notif.max_attempts || 5);
  const newStatus = isPermanentFailure ? 'failed' : 'retrying';

  const backoffMinutes = Math.min(attemptNum * 5, 60);
  const nextRetryAt = isPermanentFailure
    ? null
    : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

  await supabase
    .from('order_notifications')
    .update({
      status: newStatus,
      last_error: sanitizedErr,
      next_retry_at: nextRetryAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', notif.id);

  if (notif.notification_type.startsWith('merchant')) {
    await supabase.from('orders').update({
      merchant_alert_sent: false,
      merchant_alert_status: newStatus,
      merchant_alert_error: sanitizedErr
    }).eq('id', notif.order_id);
  } else {
    await supabase.from('orders').update({
      email_receipt_sent: false,
      email_status: newStatus,
      email_last_error: sanitizedErr
    }).eq('id', notif.order_id);
  }

  return { id: notif.id, order_id: notif.order_id, status: newStatus, error: sanitizedErr };
}

/**
 * Atomically claims & dispatches all pending notifications for a specific order.
 */
async function dispatchOrderNotifications(supabase, orderId) {
  if (!supabase || !orderId) {
    return { success: false, error: 'Missing supabase client or orderId' };
  }

  try {
    const claimed = await claimNotifications(supabase, orderId, 20);
    if (claimed.length === 0) {
      return { success: true, count: 0, message: 'No pending notifications available to claim' };
    }

    const results = [];
    for (const notif of claimed) {
      results.push(await processClaimedNotification(supabase, notif));
    }

    return { success: true, count: results.length, results };
  } catch (outerErr) {
    console.error('Unhandled error in dispatchOrderNotifications:', outerErr);
    return { success: false, error: outerErr.message };
  }
}

/**
 * Atomically claims & retries all due notifications across orders (including expired processing leases).
 */
async function retryPendingNotifications(supabase, limit = 20) {
  if (!supabase) return { success: false, error: 'Missing supabase client' };

  try {
    const claimed = await claimNotifications(supabase, null, limit);
    if (claimed.length === 0) {
      return { success: true, processed: 0, message: 'No notifications due for retry' };
    }

    const results = [];
    for (const notif of claimed) {
      results.push(await processClaimedNotification(supabase, notif));
    }

    return { success: true, processed: results.length, details: results };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Enriches queued order_notifications rows with escaped HTML email templates
 * (Executed cleanly before dispatchOrderNotifications so templates have rich item breakdowns)
 */
async function enrichOrderNotifications(supabase, {
  orderId,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  items,
  totalAmount,
  isShortfall = false,
  shortfallDetails = null
}) {
  if (!supabase || !orderId) return;

  const formattedAddress = shippingAddress?.line1
    ? `${escapeHtml(shippingAddress.line1)}${shippingAddress.line2 ? ', ' + escapeHtml(shippingAddress.line2) : ''}, ${escapeHtml(shippingAddress.city)}, ${escapeHtml(shippingAddress.state)} ${escapeHtml(shippingAddress.postal_code)}`
    : 'Customer Address on file';

  const itemsListHtml = (items || []).map(i => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #2A2536; color:#FFFFFF;">${escapeHtml(i.title || i.id)} &times; ${Number(i.qty) || 1}</td>
      <td style="padding:8px 0; border-bottom:1px solid #2A2536; text-align:right; color:#FF539B; font-weight:bold;">$${((Number(i.price) || 0) * (Number(i.qty) || 1)).toFixed(2)}</td>
    </tr>
  `).join('');

  const merchantListHtml = (items || []).map(i => `<li>${escapeHtml(i.title || i.id)} &times; ${Number(i.qty) || 1}</li>`).join('');

  const merchantBody = isShortfall
    ? `<div style="font-family:sans-serif; padding:20px; color:#222;">
         <h2 style="color:#DC2626;">⚠️ ACTION REQUIRED: Inventory Shortfall on Paid Order ${escapeHtml(orderId)}</h2>
         <p><strong>Customer:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail || 'No email')}, ${escapeHtml(customerPhone || 'No phone')})</p>
         <p><strong>Total Paid:</strong> $${Number(totalAmount || 0).toFixed(2)} USD via Stripe</p>
         <p style="color:#B91C1C; font-weight:bold;">One or more items exceeded available stock. Zero stock was deducted, and the order has been preserved with status 'Backordered_Action_Required'.</p>
         <h3>Shortfall Details:</h3>
         <pre style="background:#F3F4F6; padding:12px; border-radius:6px;">${escapeHtml(JSON.stringify(shortfallDetails || [], null, 2))}</pre>
         <p><a href="https://offdahook.vercel.app/admin.html" style="background:#DC2626; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard</a></p>
       </div>`
    : `<div style="font-family:sans-serif; padding:20px; color:#222;">
         <h2>🎉 New Crown Order Received: ${escapeHtml(orderId)}</h2>
         <p><strong>Customer:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail || 'No email')}, ${escapeHtml(customerPhone || 'No phone')})</p>
         <p><strong>Total:</strong> $${Number(totalAmount || 0).toFixed(2)} USD</p>
         <p><strong>Shipping Address:</strong><br>${formattedAddress}</p>
         <h3>Items to Fulfill:</h3>
         <ul>${merchantListHtml}</ul>
         <p><a href="https://offdahook.vercel.app/admin.html" style="background:#FF539B; color:#fff; padding:10px 16px; text-decoration:none; border-radius:4px;">Open Admin Dashboard</a></p>
       </div>`;

  const customerBody = isShortfall
    ? `<div style="font-family:sans-serif; background:#0F0B15; color:#F0EEF8; padding:32px; border-radius:8px; max-width:600px; margin:0 auto;">
         <h2 style="color:#FF539B;">Off Da Hook Salon Suites — Order Update: ${escapeHtml(orderId)}</h2>
         <p>Thank you, ${escapeHtml(customerName)}. Your payment has been confirmed, however one or more formulas in your order are currently on brief backorder.</p>
         <p>Master Stylist Shawnese Parker has been alerted and will reach out shortly at (347) 238-1602 or via email regarding fulfillment options.</p>
       </div>`
    : `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#0F0B15; color:#F0EEF8; padding:32px; border-radius:8px; max-width:600px; margin:0 auto;">
         <div style="text-align:center; margin-bottom:24px;">
           <h1 style="color:#FF539B; margin:0; font-size:24px; letter-spacing:1px;">OFF DA HOOK SALON SUITES</h1>
           <p style="color:#A39EB2; font-size:12px; margin-top:4px;">Rosedale, NY • Phenix Salon Suites Suite #192</p>
         </div>
         <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:20px; margin-bottom:20px;">
           <h2 style="color:#FFFFFF; margin-top:0; font-size:18px;">Crown Order Confirmed: ${escapeHtml(orderId)}</h2>
           <p style="font-size:14px; line-height:1.6; color:#C5C0D4;">Thank you, ${escapeHtml(customerName)}! Your signature hair care order has been verified and is being prepared with utmost care.</p>
           <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:14px;">
             <thead>
               <tr style="border-bottom:1px solid #362E48; color:#A39EB2; text-align:left;">
                 <th style="padding-bottom:8px;">Formula</th>
                 <th style="padding-bottom:8px; text-align:right;">Total</th>
               </tr>
             </thead>
             <tbody>${itemsListHtml}</tbody>
           </table>
           <div style="display:flex; justify-content:space-between; margin-top:16px; padding-top:12px; border-top:2px solid #362E48; font-size:16px; font-weight:bold;">
             <span>Total Paid</span>
             <span style="color:#FF539B;">$${Number(totalAmount || 0).toFixed(2)} USD</span>
           </div>
         </div>
         <div style="background:#1B1526; border:1px solid #362E48; border-radius:8px; padding:16px; font-size:13px; color:#A39EB2;">
           <strong style="color:#FFFFFF;">Shipping To:</strong><br>${escapeHtml(customerName)}<br>${formattedAddress}<br>Phone: ${escapeHtml(customerPhone || 'On file')}
         </div>
       </div>`;

  try {
    const merchantType = isShortfall ? 'merchant_shortfall_alert' : 'merchant_order_alert';
    const customerType = isShortfall ? 'customer_backorder_notice' : 'customer_order_receipt';

    const targetMerchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
    await supabase
      .from('order_notifications')
      .update({ html_body: merchantBody, recipient: targetMerchantEmail, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('notification_type', merchantType);

    if (customerEmail) {
      await supabase
        .from('order_notifications')
        .update({ html_body: customerBody, updated_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('notification_type', customerType);
    }
  } catch (e) {
    console.warn('Could not enrich notification HTML bodies:', e.message);
  }
}

module.exports = {
  enrichOrderNotifications,
  dispatchOrderNotifications,
  retryPendingNotifications,
  sendEmailViaResendRest,
  sanitizeErrorMessage
};
