// ========================================================================
// OFF DA HOOK SALON SUITES - SECURE CONTACT, INQUIRY & CAREERS API
// Handles #contact-page-form, #suite-contact-form, and #career-application-form
// Dispatches verified submissions via Resend REST API with spam defense,
// strict validation, HTML escaping, and honest provider-acceptance responses.
// ========================================================================
const crypto = require('crypto');
const { STORE_CONFIG, applySecureCors, escapeHtml } = require('./_payment-validation');
const { sendEmailViaResendRest, sanitizeErrorMessage } = require('./_notification-outbox');

const ALLOWED_FORM_TYPES = ['contact_request', 'suite_inquiry', 'career_application'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// In-memory IP rate limit & short-window duplicate submission protection
const ipSubmissions = new Map();
const recentHashes = new Map();

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const DEDUP_WINDOW_MS = 30 * 1000; // 30 seconds

function isOriginAllowed(reqOrigin) {
  if (!reqOrigin) return true; // Same-origin/server-side calls without Origin header
  if (STORE_CONFIG.ALLOWED_ORIGINS.includes(reqOrigin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin)) return true;
  return false;
}

function cleanSingleLine(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen + 1);
}

function validateContactPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, status: 400, error: 'Request payload must be a JSON object.' };
  }

  // Honeypot spam defense
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return { valid: false, status: 400, error: 'Submission rejected by spam protection.' };
  }
  if (typeof body._hp === 'string' && body._hp.trim().length > 0) {
    return { valid: false, status: 400, error: 'Submission rejected by spam protection.' };
  }

  // Explicitly reject unsupported file attachments (never silently discard CVs)
  if (body.attachments || body.cvFile || body.resumeFile) {
    return {
      valid: false,
      status: 400,
      error: 'Direct file attachments are not supported on web forms. Please paste a link to your portfolio/resume or email your CV directly.'
    };
  }

  const formType = typeof body.formType === 'string' ? body.formType.trim() : '';
  if (!ALLOWED_FORM_TYPES.includes(formType)) {
    return { valid: false, status: 400, error: 'Unsupported or missing form submission type.' };
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (rawName.length < 2 || rawName.length > 120) {
    return { valid: false, status: 400, error: 'Please provide your full name (2 to 120 characters).' };
  }

  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const digitsOnly = rawPhone.replace(/\D/g, '');
  if (rawPhone.length < 7 || rawPhone.length > 30 || digitsOnly.length < 7) {
    return { valid: false, status: 400, error: 'Please provide a valid phone number.' };
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const emailRequired = formType === 'suite_inquiry' || formType === 'career_application';
  if (emailRequired && !rawEmail) {
    return { valid: false, status: 400, error: 'A valid email address is required.' };
  }
  if (rawEmail && (rawEmail.length > 254 || !EMAIL_REGEX.test(rawEmail))) {
    return { valid: false, status: 400, error: 'Please provide a valid email address.' };
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length > 2000) {
    return { valid: false, status: 400, error: 'Message exceeds maximum length of 2,000 characters.' };
  }

  const data = {
    formType,
    name: cleanSingleLine(rawName, 120),
    phone: cleanSingleLine(rawPhone, 30),
    email: rawEmail ? cleanSingleLine(rawEmail, 254) : '',
    notes: notes
  };

  if (formType === 'contact_request' || formType === 'suite_inquiry') {
    const service = typeof body.service === 'string' ? body.service.trim() : '';
    if (!service || service.length > 150) {
      return { valid: false, status: 400, error: 'Please select a valid salon service (max 150 characters).' };
    }
    const preferredDate = typeof body.preferredDate === 'string' ? body.preferredDate.trim() : '';
    if (preferredDate.length > 40) {
      return { valid: false, status: 400, error: 'Preferred date format is invalid.' };
    }
    data.service = cleanSingleLine(service, 150);
    data.preferredDate = cleanSingleLine(preferredDate, 40);
  }

  if (formType === 'career_application') {
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    const experience = typeof body.experience === 'string' ? body.experience.trim() : '';
    const license = typeof body.license === 'string' ? body.license.trim() : '';
    const availability = typeof body.availability === 'string' ? body.availability.trim() : '';
    const portfolio = typeof body.portfolio === 'string' ? body.portfolio.trim() : '';

    if (!role || !experience || !license || !availability) {
      return { valid: false, status: 400, error: 'Please complete all required career application fields.' };
    }
    if (role.length > 200 || experience.length > 200 || license.length > 200 || availability.length > 200 || portfolio.length > 300) {
      return { valid: false, status: 400, error: 'One or more career fields exceed allowed length limits.' };
    }

    data.role = cleanSingleLine(role, 200);
    data.experience = cleanSingleLine(experience, 200);
    data.license = cleanSingleLine(license, 200);
    data.availability = cleanSingleLine(availability, 200);
    data.portfolio = cleanSingleLine(portfolio, 300);
  }

  return { valid: true, data };
}

function resolveBusinessRecipient(formType) {
  const merchantAlert = (process.env.MERCHANT_ALERT_EMAIL || '').trim();
  const contactAlert = (process.env.CONTACT_ALERT_EMAIL || '').trim();
  const careerAlert = (process.env.CAREER_ALERT_EMAIL || '').trim();

  const candidate = formType === 'career_application'
    ? (careerAlert || contactAlert || merchantAlert)
    : (contactAlert || merchantAlert);

  if (!candidate || !EMAIL_REGEX.test(candidate)) {
    return null;
  }
  return candidate;
}

function buildInquiryEmail(data) {
  let subjectPrefix = 'Suite Inquiry';
  let rowsHtml = `
    <tr><td style="padding:8px 0; color:#6B647D;"><strong>Full Name:</strong></td><td style="padding:8px 0;">${escapeHtml(data.name)}</td></tr>
    <tr><td style="padding:8px 0; color:#6B647D;"><strong>Phone:</strong></td><td style="padding:8px 0;">${escapeHtml(data.phone)}</td></tr>
    <tr><td style="padding:8px 0; color:#6B647D;"><strong>Email:</strong></td><td style="padding:8px 0;">${escapeHtml(data.email || 'Not provided')}</td></tr>
  `;

  if (data.formType === 'career_application') {
    subjectPrefix = `Career Application (${data.role})`;
    rowsHtml += `
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>Position:</strong></td><td style="padding:8px 0;">${escapeHtml(data.role)}</td></tr>
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>Experience:</strong></td><td style="padding:8px 0;">${escapeHtml(data.experience)}</td></tr>
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>License Status:</strong></td><td style="padding:8px 0;">${escapeHtml(data.license)}</td></tr>
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>Availability:</strong></td><td style="padding:8px 0;">${escapeHtml(data.availability)}</td></tr>
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>Portfolio / IG:</strong></td><td style="padding:8px 0;">${escapeHtml(data.portfolio || 'Not provided')}</td></tr>
    `;
  } else {
    subjectPrefix = data.formType === 'contact_request'
      ? `Suite Booking Request (${data.service})`
      : `Service Inquiry (${data.service})`;
    rowsHtml += `
      <tr><td style="padding:8px 0; color:#6B647D;"><strong>Service:</strong></td><td style="padding:8px 0;">${escapeHtml(data.service)}</td></tr>
      ${data.preferredDate ? `<tr><td style="padding:8px 0; color:#6B647D;"><strong>Preferred Date:</strong></td><td style="padding:8px 0;">${escapeHtml(data.preferredDate)}</td></tr>` : ''}
    `;
  }

  const safeSubject = `${subjectPrefix} — ${data.name}`.replace(/[\r\n]+/g, ' ').slice(0, 180);
  const notesHtml = escapeHtml(data.notes || 'None provided').replace(/\n/g, '<br>');

  const htmlBody = `
    <div style="font-family:sans-serif; padding:24px; color:#1E1B24; max-width:600px; border:1px solid #E5E7EB; border-radius:8px;">
      <h2 style="color:#D81B60; margin-top:0;">Off Da Hook Salon Suites — ${escapeHtml(subjectPrefix)}</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="margin-top:16px; padding:14px; background:#F9FAFB; border-radius:6px; font-size:14px;">
        <strong>Notes / Message:</strong><br>${notesHtml}
      </div>
      <p style="font-size:12px; color:#6B7280; margin-top:18px;">
        Submitted via Off Da Hook Website (${escapeHtml(data.formType)}). Reply directly to reach the client if an email was supplied.
      </p>
    </div>
  `;

  return { subject: safeSubject, htmlBody };
}

const handler = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  applySecureCors(req, res, 'POST, OPTIONS', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Validate Request Origin
  const reqOrigin = req.headers.origin;
  if (reqOrigin && !isOriginAllowed(reqOrigin)) {
    return res.status(403).json({ success: false, error: 'Forbidden request origin.' });
  }

  // Validate Content-Type
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ success: false, error: 'Content-Type must be application/json.' });
  }

  // Client IP Rate Limiting
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = req.headers['x-real-ip'] || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const rec = ipSubmissions.get(clientIp);
  if (rec && now - rec.windowStart < RATE_WINDOW_MS) {
    if (rec.count >= MAX_SUBMISSIONS_PER_WINDOW) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({
        success: false,
        error: 'Too many submissions. Please wait a few minutes or call (347) 238-1602.'
      });
    }
    rec.count += 1;
  } else {
    ipSubmissions.set(clientIp, { windowStart: now, count: 1 });
  }

  // Server-Side Payload Validation
  const validation = validateContactPayload(req.body);
  if (!validation.valid) {
    return res.status(validation.status).json({ success: false, error: validation.error });
  }

  const data = validation.data;

  // Duplicate Submission Protection (30s identical payload window)
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');

  const lastSentAt = recentHashes.get(payloadHash);
  if (lastSentAt && now - lastSentAt < DEDUP_WINDOW_MS) {
    return res.status(429).json({
      success: false,
      error: 'Your identical inquiry was just submitted. Please wait a moment before sending again.'
    });
  }

  // Authoritative Server-Configured Business Recipient
  const recipient = resolveBusinessRecipient(data.formType);
  if (!recipient) {
    console.error(`CRITICAL: No recipient configured for contact formType=${data.formType}`);
    return res.status(503).json({
      success: false,
      error: 'Email delivery is awaiting business recipient configuration. Please call Shawnese directly at (347) 238-1602.'
    });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('CRITICAL: RESEND_API_KEY is missing in environment.');
    return res.status(503).json({
      success: false,
      error: 'Email delivery service is not configured yet. Please call (347) 238-1602.'
    });
  }

  try {
    const { subject, htmlBody } = buildInquiryEmail(data);
    const idempotencyKey = `contact-${payloadHash.slice(0, 20)}-${Math.floor(now / DEDUP_WINDOW_MS)}`;
    const sendResult = await sendEmailViaResendRest(
      recipient,
      subject,
      htmlBody,
      idempotencyKey,
      data.email || null
    );

    if (!sendResult.success) {
      const safeErr = sanitizeErrorMessage(sendResult.error);
      console.error(`Contact email dispatch rejected (${data.formType}):`, safeErr);
      return res.status(502).json({
        success: false,
        error: 'We could not deliver your message right now. Your details were kept on the page—please try again or call (347) 238-1602.'
      });
    }

    recentHashes.set(payloadHash, now);

    return res.status(200).json({
      success: true,
      status: 'accepted_by_provider',
      providerMessageId: sendResult.id || null,
      message: 'Your inquiry has been submitted and accepted for delivery to Shawnese Parker.'
    });
  } catch (err) {
    console.error('Unhandled error in /api/contact:', sanitizeErrorMessage(err));
    return res.status(500).json({
      success: false,
      error: 'Unexpected server error while sending your message. Please call (347) 238-1602.'
    });
  }
};

handler._internals = {
  validateContactPayload,
  resolveBusinessRecipient,
  buildInquiryEmail,
  isOriginAllowed,
  ipSubmissions,
  recentHashes
};

module.exports = handler;
