// ========================================================================
// OFF DA HOOK SALON SUITES - SECURE ADMIN AUTHENTICATION API
// Cryptographic HMAC-SHA256 Session Tokens, Expiration & Rate Limiting
// ========================================================================
const crypto = require('crypto');
const { applySecureCors } = require('./_payment-validation');

// In-memory rate limiting map for failed login attempts
// Map: IP -> { attempts: number, lockUntil: number }
const loginAttempts = new Map();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours session expiration

// Helper: Timing-safe string comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Helper: Sign HMAC-SHA256 token
function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

// Helper: Verify HMAC-SHA256 token
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, signature] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (!safeCompare(signature, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  applySecureCors(req, res, 'POST, GET, OPTIONS', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = req.headers['x-real-ip'] || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.socket?.remoteAddress || 'unknown-ip';
  const masterPin = process.env.ADMIN_PIN;

  if (!masterPin) {
    console.error('CRITICAL: ADMIN_PIN environment variable is not defined.');
    return res.status(503).json({
      success: false,
      error: 'Admin authentication is not configured on the server. Please define ADMIN_PIN in Vercel.'
    });
  }

  // GET: Verify existing session token
  if (req.method === 'GET') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, authenticated: false, error: 'Missing session token' });
    }

    const token = authHeader.substring(7).trim();
    const verified = verifyToken(token, masterPin);

    if (!verified) {
      return res.status(401).json({ success: false, authenticated: false, error: 'Session expired or invalid' });
    }

    return res.status(200).json({ success: true, authenticated: true, expiresAt: verified.exp });
  }

  // POST: Login with Passcode
  if (req.method === 'POST') {
    // 1. Check Rate Limiting
    const attemptRecord = loginAttempts.get(clientIp);
    if (attemptRecord) {
      if (attemptRecord.lockUntil && Date.now() < attemptRecord.lockUntil) {
        const remainingSec = Math.ceil((attemptRecord.lockUntil - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: `Too many failed attempts. Login locked for ${remainingSec} seconds.`
        });
      }
      if (attemptRecord.lockUntil && Date.now() >= attemptRecord.lockUntil) {
        loginAttempts.delete(clientIp); // Reset expired lock
      }
    }

    const { pin } = req.body || {};

    if (typeof pin !== 'string' || !pin.trim()) {
      return res.status(400).json({ success: false, error: 'Valid passcode string is required' });
    }

    // 2. Validate PIN with Constant-Time Comparison
    const isValid = safeCompare(pin.trim(), masterPin.trim());

    if (!isValid) {
      // Record failed attempt
      const current = loginAttempts.get(clientIp) || { attempts: 0, lockUntil: 0 };
      current.attempts += 1;
      if (current.attempts >= MAX_ATTEMPTS) {
        current.lockUntil = Date.now() + LOCKOUT_MS;
        console.warn(`SECURITY ALERT: IP ${clientIp} locked out after ${MAX_ATTEMPTS} failed admin attempts.`);
      }
      loginAttempts.set(clientIp, current);

      return res.status(401).json({
        success: false,
        error: current.lockUntil
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : `Invalid Admin Passcode. (${MAX_ATTEMPTS - current.attempts} attempt(s) remaining)`
      });
    }

    // 3. Login Successful: Reset rate limit & issue cryptographic token
    loginAttempts.delete(clientIp);

    const now = Date.now();
    const payload = {
      role: 'admin',
      iat: now,
      exp: now + SESSION_TTL_MS
    };

    const sessionToken = signToken(payload, masterPin);

    return res.status(200).json({
      success: true,
      token: sessionToken,
      expiresAt: payload.exp,
      message: 'Authentication successful'
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};

// Export verification helper for serverless modules
module.exports.verifyToken = verifyToken;
