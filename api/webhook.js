// ========================================================================
// OFF DA HOOK SALON SUITES - PRODUCTION STRIPE WEBHOOK HANDLER
// Vercel Serverless Function with Raw Body Buffering & Unified Atomic Transactions
// Third-Round Zero-Trust Hardening Corrections:
//   1. In-Flight Retry Guarantee: Returns retryable HTTP 503 (with Retry-After: 5)
//      when an event is actively in-flight, preventing premature false 200 acknowledgements.
//   2. Durable Notification Outbox: Uses _notification-outbox for retryable, tracked emails.
//   3. Server-Authoritative Checkout Intents: Reconciles cart against checkout_intents table.
//   4. Protected Failure Logging: Calls record_webhook_failure which preserves completed state.
//   5. Explicit Async Payment Failure: checkout.session.async_payment_failed explicitly handled,
//      marking intent cancelled with zero order creation and zero stock deduction.
// ========================================================================
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { validateStripeSession, escapeHtml } = require('./_payment-validation');
const { dispatchOrderNotifications, enrichOrderNotifications, sendEmailViaResendRest } = require('./_notification-outbox');

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

// Stream buffer reader for raw payload verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
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

  // 1. Handle Asynchronous Payment Failure
  // Explicitly guarantees ZERO order creation and ZERO stock deduction
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

        // Cancel checkout intent if present
        if (session.metadata?.checkout_intent_id) {
          await supabase
            .from('checkout_intents')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', session.metadata.checkout_intent_id);
        }
      } catch (e) {
        console.error('Failed to log async payment failure:', e.message);
      }
    }

    const merchantEmail = process.env.MERCHANT_ALERT_EMAIL || 'offdahooksalon@gmail.com';
    await sendEmailViaResendRest(
      merchantEmail,
      `⚠️ Payment Failed for Session: ${escapeHtml(session.id)}`,
      `<p>An asynchronous payment attempt failed for Stripe session <strong>${escapeHtml(session.id)}</strong>. No order was fulfilled.</p>`
    );

    return res.status(200).json({
      received: true,
      status: 'async_payment_failed_recorded',
      session_id: session.id,
      order_created: false,
      stock_deducted: false
    });
  }

  // 2. Handle Successful Checkout Payments (immediate and asynchronous)
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;

    try {
      if (!supabase) {
        console.error('CRITICAL: Supabase client not initialized in webhook.');
        return res.status(500).json({ error: 'Database service unavailable' });
      }

      // Check for authoritative server-side checkout intent
      let authoritativeIntent = null;
      if (session.metadata?.checkout_intent_id) {
        try {
          const { data: intent } = await supabase
            .from('checkout_intents')
            .select('*')
            .eq('id', session.metadata.checkout_intent_id)
            .maybeSingle();

          if (intent) {
            authoritativeIntent = intent;
          }
        } catch (intentErr) {
          console.warn('Failed to fetch checkout_intent:', intentErr.message);
        }
      }

      // Authoritative Shared Payment Validation (Reconciles amount, currency, session ownership & items)
      let validatedSession;
      try {
        validatedSession = validateStripeSession(session, { intent: authoritativeIntent });
      } catch (valErr) {
        // If payment is pending on a completed event, defer fulfillment safely
        if (valErr.code === 'PAYMENT_NOT_PAID') {
          console.warn(`Payment status '${session.payment_status}' for session ${session.id}. Deferring fulfillment until async payment succeeds.`);
          return res.status(200).json({ received: true, status: 'payment_pending' });
        }

        console.error(`Session validation rejected: ${valErr.message}`);
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

      // Extract Customer & Order Information
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

      // Single Authoritative Processing Route via process_paid_order_atomic
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

      // Handle Duplicate Event (Idempotency Protection)
      if (rpcData.duplicate === true) {
        console.log(`Idempotency defense: Event ${event.id} or session ${session.id} already processed. Order ID: ${rpcData.order_id}`);
        // Self-healing: Ensure any pending notifications are dispatched
        if (rpcData.order_id) {
          dispatchOrderNotifications(supabase, rpcData.order_id).catch(() => {});
        }
        return res.status(200).json({ received: true, duplicate: true, orderId: rpcData.order_id });
      }

      // Handle In-Flight Concurrent Worker:
      // Return retryable HTTP 503 Service Unavailable with Retry-After: 5
      // Guarantees Stripe does NOT falsely mark the event as delivered while processing is incomplete!
      if (rpcData.in_flight === true) {
        console.warn(`Concurrent processing in progress for event ${event.id}. Returning 503 to maintain retry guarantee.`);
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          error: 'Webhook event is currently in flight under an active processing lease. Retry requested.',
          in_flight: true
        });
      }

      // Handle Inventory Shortfall (Customer Paid, but Item(s) Out of Stock)
      if (rpcData.action_required === true && rpcData.error_code === 'INVENTORY_SHORTFALL') {
        const shortfallOrderId = rpcData.order_id || orderId;
        console.warn(`INVENTORY SHORTFALL ALERT for order ${shortfallOrderId}: Customer paid, items out of stock.`);

        await enrichOrderNotifications(supabase, {
          orderId: shortfallOrderId,
          customerName,
          customerEmail,
          customerPhone,
          shippingAddress,
          items,
          totalAmount,
          isShortfall: true,
          shortfallDetails: rpcData.shortfall_details
        });

        // Dispatch durable notifications from outbox
        await dispatchOrderNotifications(supabase, shortfallOrderId);

        return res.status(200).json({
          received: true,
          action_required: true,
          orderId: shortfallOrderId,
          message: 'Order saved as Backordered_Action_Required due to stock shortfall.'
        });
      }

      // Happy Path: Order Successfully Persisted & Stock Deducted Atomically
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

      await enrichOrderNotifications(supabase, {
        orderId: effectiveOrderId,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        items,
        totalAmount,
        isShortfall: false
      });

      // Dispatch Durable Notifications (both merchant alert and customer receipt) from Outbox
      await dispatchOrderNotifications(supabase, effectiveOrderId);

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
