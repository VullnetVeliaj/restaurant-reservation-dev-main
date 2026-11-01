const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const { isProduction } = require('./config/runtime');

const app = express();

app.disable('x-powered-by');

/**
 * Client IP resolution for rate limiting.
 * Vercel's edge overwrites X-Forwarded-For with the real client IP, so exactly
 * one proxy hop is trusted there. Locally nothing is trusted, so a spoofed
 * X-Forwarded-For header cannot change req.ip. Override with TRUST_PROXY
 * (a hop count, "false", or an Express trust-proxy expression) if hosting changes.
 */
function resolveTrustProxy() {
  const configured = process.env.TRUST_PROXY;
  if (configured === undefined || configured === '') {
    return process.env.VERCEL ? 1 : false;
  }
  if (configured === 'false') return false;
  if (configured === 'true') return true;
  if (/^\d+$/.test(configured)) return Number(configured);
  return configured;
}

app.set('trust proxy', resolveTrustProxy());
const TRUSTED_ORIGINS = [
  'http://restaurant-demo.local',
  'https://novi-restaurant-demo.vercel.app',
  'https://restaurant-reservation-dev.vercel.app'
];

/**
 * Endpoints the embeddable booking widget calls from customer sites
 * (e.g. WordPress). They are unauthenticated (no cookies, no JWT), so any
 * origin may call them. Everything else (admin, auth, settings) stays
 * restricted to the trusted TableAI origins.
 */
const PUBLIC_WIDGET_PATHS = [
  /^(\/api)?\/public\/widget\/[^/]+\/?$/,
  /^(\/api)?\/(reservations\/)?availability\/?$/,
  /^(\/api)?\/reservations\/?$/,
  /^(\/api)?\/reservations\/cancel\/?$/,
  /^(\/api)?\/reservations\/[^/]+\/cancel\/?$/,
  /^(\/api)?\/voice(\/parse)?\/?$/
];

const isPublicWidgetPath = (urlPath) =>
  PUBLIC_WIDGET_PATHS.some((pattern) => pattern.test(urlPath));

app.use(
  cors((req, callback) => {
    callback(null, {
      origin: isPublicWidgetPath(req.path) ? '*' : TRUSTED_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    });
  })
);
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Production response hygiene: error bodies keep their message but drop
 * internal diagnostics (raw DB/provider error text, stack traces).
 * Full errors are still written to the server log by each handler.
 */
if (isProduction) {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400 && body && typeof body === 'object' && body.error && typeof body.error === 'object') {
        const { details, stack, ...safeError } = body.error;
        body = { ...body, error: safeError };
      }
      return originalJson(body);
    };
    next();
  });
}

// Serve static frontend assets from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Clean page route aliases
// Admin dashboard: one app (public/admin.html), client-side routed (/dashboard/<view>)
const sendAdminApp = (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
app.get('/dashboard', sendAdminApp);
app.get('/dashboard/:view', sendAdminApp);
app.get('/admin', (req, res) => res.redirect('/dashboard/reservations'));
app.get('/admin/crm', (req, res) => res.redirect('/dashboard/crm'));
app.get('/admin/floor', (req, res) => res.redirect('/dashboard/reservations'));
app.get('/admin/settings', (req, res) => res.redirect('/dashboard/settings'));
app.get('/crm', (req, res) => res.redirect('/dashboard/crm'));
// Public booking page by restaurant slug: /book/<slug>
app.get('/book/:slug', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'booking.html')));
app.get('/manage', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'manage.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'register.html')));

// Mount API routes (supports both /api/voice/parse and /voice/parse)
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

// Centralized error handling middleware
app.use(errorHandler);

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Restaurant Reservation API running on http://localhost:${PORT}`);
    console.log(`[Server] Health Check available at http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
