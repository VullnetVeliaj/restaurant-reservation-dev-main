const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const settingsRoutes = require('./settingsRoutes');
const reservationRoutes = require('./reservationRoutes');
const adminRoutes = require('./adminRoutes');
const voiceRoutes = require('./voiceRoutes');
const publicRoutes = require('./publicRoutes');
// NEW

const restaurantRoutes = require('./restaurantRoutes');
const { detectSupabaseKeyRole } = require('../config/supabaseKey');
const { resolvePublicRestaurantId, sendResolverError } = require('../utils/restaurantResolver');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'restaurant-reservation-api',
    auth: 'jwt-enabled',
    rbac: ['OWNER', 'MANAGER', 'STAFF']
  });
});




router.get('/env-check', (req, res) => {
  res.json({
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,

    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseKey: Boolean(process.env.SUPABASE_KEY),
    supabaseServiceRoleKey:
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),

    // Role of the key the backend actually uses (never the key itself)
    supabaseKeyRole: detectSupabaseKeyRole(),

    resendApiKey:
      Boolean(process.env.RESEND_API_KEY),

    resendFromEmail:
      Boolean(process.env.RESEND_FROM_EMAIL),

    geminiApiKey:
      Boolean(process.env.GEMINI_API_KEY)
  });
});







// Authentication & Onboarding: /api/auth
router.use('/auth', authRoutes);

// Voice intent parser: /api/voice
router.use('/voice', voiceRoutes);

// Restaurant & Staff Settings: /api/settings
router.use('/settings', settingsRoutes);

// Customer reservation routes: /api/reservations
router.use('/reservations', reservationRoutes);
// Public booking widget: /api/public

router.use('/public', publicRoutes);
// NEW - PUBLIC RESTAURANT PROFILE

router.use('/restaurants', restaurantRoutes);
// Direct availability route: /api/availability
const availabilityService = require('../services/availabilityService');
router.get('/availability', async (req, res) => {
  try {
    const { date, party_size = 2 } = req.query;

    // Restaurant from the public widget key (preferred) or an existing restaurant_id; no default
    let restaurant_id;
    try {
      restaurant_id = await resolvePublicRestaurantId(req);
    } catch (resolveErr) {
      return sendResolverError(res, resolveErr);
    }
    if (!date) {
      return res.status(400).json({
        success: false,
        error: { message: 'The date query parameter (YYYY-MM-DD) is required.' }
      });
    }
    const availability = await availabilityService.getAvailableSlots(
      restaurant_id,
      date,
      parseInt(party_size, 10) || 2
    );
    return res.status(200).json(availability);
  } catch (err) {
    console.error('[GET /api/availability] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to calculate availability slots', details: err.message }
    });
  }
});

// Admin reservation routes: /api/admin
router.use('/admin', adminRoutes);

module.exports = router;
