const rateLimit = require('express-rate-limit');

/**
 * Rate limiters for public / abuse-prone endpoints.
 *
 * Client identity: express-rate-limit keys on req.ip (IPv6 grouped per /56).
 * req.ip is only trustworthy because src/server.js configures `trust proxy`
 * for exactly one hop on Vercel, whose edge overwrites X-Forwarded-For with the
 * real client address. Client-supplied left-most X-Forwarded-For entries are
 * therefore ignored.
 *
 * Store: the default in-memory store is per serverless instance, so limits are
 * best-effort across Vercel instances (see report / follow-ups for a shared store).
 */
function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message
        }
      });
    }
  });
}

const MINUTE = 60 * 1000;

// Account creation: generous enough for typos, blocks scripted sign-up floods
const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 5,
  message: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es in einer Stunde erneut.'
});

// Public booking creation from the widget
const publicBookingLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Zu viele Reservierungsanfragen. Bitte versuchen Sie es in einigen Minuten erneut.'
});

// Guest self-cancellation via emailed cancellation token
const cancellationLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Zu viele Stornierungsversuche. Bitte versuchen Sie es in einigen Minuten erneut.'
});

// Single-reservation lookup and guest-status checks (both authenticated)
const lookupLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: 'Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.'
});

// Gemini voice parsing (paid API)
const voiceLimiter = createLimiter({
  windowMs: 10 * MINUTE,
  limit: 20,
  message: 'Zu viele Sprachanfragen. Bitte versuchen Sie es in einigen Minuten erneut.'
});

module.exports = {
  createLimiter,
  registerLimiter,
  publicBookingLimiter,
  cancellationLimiter,
  lookupLimiter,
  voiceLimiter
};
