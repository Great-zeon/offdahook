// ========================================================================
// OFF DA HOOK SALON SUITES - PROTECTED NOTIFICATION RETRY API
// Server-side authenticated endpoint to re-dispatch queued/failed notifications
// ========================================================================
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { verifyToken } = require('./auth');
const { applySecureCors } = require('./_payment-validation');
const { retryPendingNotifications } = require('./_notification-outbox');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  applySecureCors(req, res, 'POST, OPTIONS', 'Content-Type, Authorization, x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Server-side Authorization: Requires Admin Bearer token or Cron Secret
  const authHeader = req.headers['authorization'];
  const cronSecret = req.headers['x-cron-secret'];
  const masterPin = process.env.ADMIN_PIN;
  let isAuthorized = false;

  if (cronSecret && process.env.CRON_SECRET && safeCompare(String(cronSecret), String(process.env.CRON_SECRET))) {
    isAuthorized = true;
  } else if (authHeader && authHeader.startsWith('Bearer ') && masterPin) {
    const token = authHeader.substring(7).trim();
    isAuthorized = verifyToken(token, masterPin) !== null;
  }

  if (!isAuthorized) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Valid admin token or cron secret required' });
  }

  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    const result = await retryPendingNotifications(supabase);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Error executing notification retry worker:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
