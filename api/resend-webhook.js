// ========================================================================
// OFF DA HOOK SALON SUITES - RESEND DELIVERY LIFECYCLE WEBHOOK
// Verifies Resend Svix webhook signatures and tracks final email states
// Transitions: accepted -> delivered | bounced | complained | delayed
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

/**
 * Verifies Resend/Svix webhook signature (v1,base64)
 */
function verifyResendSignature(rawBody, headers, secret) {
  if (!secret) return false;
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Enforce 5-minute timestamp tolerance to prevent replay attacks
  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec = parseInt(svixTimestamp, 10);
  if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) {
    return false;
  }

  const secretKey = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret);
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
  const expectedSig = crypto.createHmac('sha256', secretKey).update(signedContent).digest('base64');

  const sigList = svixSignature.split(' ');
  for (const sigEntry of sigList) {
    const [version, sigVal] = sigEntry.split(',');
    if (version === 'v1' && sigVal) {
      const bufA = Buffer.from(sigVal);
      const bufB = Buffer.from(expectedSig);
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        return true;
      }
    }
  }
  return false;
}

const handler = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Resend webhook verification secret is not configured' });
  }

  let rawBody;
  let event;
  try {
    rawBody = await getRawBody(req);
    const isValid = verifyResendSignature(rawBody, req.headers, webhookSecret);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Resend webhook signature or expired timestamp' });
    }
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Malformed webhook payload' });
  }

  if (!supabase || !event || !event.type || !event.data?.email_id) {
    return res.status(200).json({ received: true, ignored: true });
  }

  const emailId = event.data.email_id;
  let newStatus = null;
  let errorDetail = null;

  switch (event.type) {
    case 'email.delivered':
      newStatus = 'delivered';
      break;
    case 'email.bounced':
      newStatus = 'bounced';
      errorDetail = event.data?.bounce?.message || 'Email bounced by recipient server';
      break;
    case 'email.complained':
      newStatus = 'complained';
      errorDetail = 'Recipient marked email as spam/complaint';
      break;
    case 'email.delivery_delayed':
      newStatus = 'delayed';
      errorDetail = 'Transient delivery delay reported by recipient mail exchanger';
      break;
    default:
      return res.status(200).json({ received: true, unhandled_type: event.type });
  }

  try {
    const { data: notif } = await supabase
      .from('order_notifications')
      .select('id, order_id, notification_type, status')
      .eq('provider_message_id', emailId)
      .maybeSingle();

    if (!notif) {
      return res.status(200).json({ received: true, matched: false });
    }

    // Idempotent duplicate replay guard
    if (notif.status === newStatus) {
      return res.status(200).json({ received: true, idempotent: true, status: newStatus });
    }

    // Protect authoritative 'delivered' state from late delayed or out-of-order bounced webhooks
    if (notif.status === 'delivered' && (newStatus === 'delayed' || newStatus === 'bounced')) {
      return res.status(200).json({ received: true, preserved_delivered: true });
    }

    await supabase
      .from('order_notifications')
      .update({
        status: newStatus,
        last_error: errorDetail ? String(errorDetail).slice(0, 500) : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', notif.id);

    // Sync delivery truth back to orders table
    if (notif.notification_type.startsWith('merchant')) {
      await supabase.from('orders').update({
        merchant_alert_sent: newStatus === 'delivered',
        merchant_alert_status: newStatus,
        merchant_alert_error: errorDetail ? String(errorDetail).slice(0, 500) : null
      }).eq('id', notif.order_id);
    } else {
      await supabase.from('orders').update({
        email_receipt_sent: newStatus === 'delivered',
        email_status: newStatus,
        email_last_error: errorDetail ? String(errorDetail).slice(0, 500) : null
      }).eq('id', notif.order_id);
    }

    return res.status(200).json({ received: true, updated_status: newStatus, notification_id: notif.id });
  } catch (dbErr) {
    console.error('Resend webhook DB error:', dbErr.message);
    return res.status(500).json({ error: 'Database update failure' });
  }
};

handler.config = {
  api: {
    bodyParser: false
  }
};

module.exports = handler;

