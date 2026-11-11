// ========================================================================
// OFF DA HOOK SALON SUITES - SHARED PAYMENT VALIDATION MODULE
// Authoritative payment validation shared between webhook and verify-session
// Guarantees zero divergence between webhook fulfillment and lazy reconciliation
// ========================================================================

const STORE_CONFIG = {
  CURRENCY: 'usd',
  STANDARD_SHIPPING_CENTS: 695, // $6.95 Standard Priority Shipping
  ALLOWED_SESSION_REGEX: /^cs_(test|live)_[a-zA-Z0-9]+$/
};

/**
 * Validates a Stripe checkout session object before order processing or reconciliation.
 * Throws an Error with a machine-readable code and message if validation fails.
 */
function validateStripeSession(session) {
  if (!session || typeof session !== 'object') {
    const err = new Error('Invalid or missing Stripe session object');
    err.code = 'INVALID_SESSION_OBJECT';
    throw err;
  }

  // 1. Validate Session Identifier Format
  if (!session.id || !STORE_CONFIG.ALLOWED_SESSION_REGEX.test(session.id)) {
    const err = new Error(`Invalid Stripe session identifier format: ${session.id || 'missing'}`);
    err.code = 'INVALID_SESSION_ID';
    throw err;
  }

  // 2. Validate Payment Status
  if (session.payment_status !== 'paid') {
    const err = new Error(`Session payment_status is not paid (received: ${session.payment_status || 'unknown'})`);
    err.code = 'PAYMENT_NOT_PAID';
    throw err;
  }

  // 3. Strict Currency Validation (Must exist and match USD)
  if (!session.currency || typeof session.currency !== 'string' || session.currency.trim().toLowerCase() !== STORE_CONFIG.CURRENCY) {
    const err = new Error(`Unsupported or missing currency: ${session.currency || 'missing'} (expected: ${STORE_CONFIG.CURRENCY})`);
    err.code = 'INVALID_CURRENCY';
    throw err;
  }

  // 4. Validate Amount Total
  if (typeof session.amount_total !== 'number' || !Number.isInteger(session.amount_total) || session.amount_total <= 0) {
    const err = new Error(`Invalid session amount_total: ${session.amount_total} (must be a positive integer in cents)`);
    err.code = 'INVALID_AMOUNT_TOTAL';
    throw err;
  }

  // 5. Validate Cart Items Metadata
  if (!session.metadata || !session.metadata.itemsJson) {
    const err = new Error('Missing itemsJson cart metadata on Stripe session');
    err.code = 'MISSING_ITEMS_METADATA';
    throw err;
  }

  let items;
  try {
    items = JSON.parse(session.metadata.itemsJson);
  } catch (parseErr) {
    const err = new Error(`Failed to parse itemsJson metadata: ${parseErr.message}`);
    err.code = 'MALFORMED_ITEMS_METADATA';
    throw err;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('itemsJson metadata must be a non-empty array of cart items');
    err.code = 'EMPTY_ITEMS_METADATA';
    throw err;
  }

  // 6. Validate Individual Item Structure
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item || typeof item !== 'object') {
      const err = new Error(`Item at index ${idx} is not a valid object`);
      err.code = 'INVALID_ITEM_STRUCTURE';
      throw err;
    }

    if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
      const err = new Error(`Item at index ${idx} is missing a valid product id`);
      err.code = 'MISSING_ITEM_ID';
      throw err;
    }

    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 10000) {
      const err = new Error(`Item "${item.id}" has invalid quantity: ${item.qty} (must be integer between 1 and 10000)`);
      err.code = 'INVALID_ITEM_QUANTITY';
      throw err;
    }

    const price = Number(item.price);
    if (isNaN(price) || price < 0) {
      const err = new Error(`Item "${item.id}" has invalid price: ${item.price}`);
      err.code = 'INVALID_ITEM_PRICE';
      throw err;
    }
  }

  return {
    isValid: true,
    sessionId: session.id,
    currency: session.currency.toLowerCase(),
    amountTotalCents: session.amount_total,
    amountTotalDollars: session.amount_total / 100,
    items: items
  };
}

/**
 * Escapes untrusted text before inserting into HTML email templates
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Masks customer email for privacy-safe confirmation display
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'Customer on file';
  }
  const [user, domain] = email.split('@');
  if (user.length <= 2) {
    return `${user[0]}***@${domain}`;
  }
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

module.exports = {
  STORE_CONFIG,
  validateStripeSession,
  escapeHtml,
  maskEmail
};
