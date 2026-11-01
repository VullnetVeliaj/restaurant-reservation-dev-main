const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationService');
const availabilityService = require('../services/availabilityService');
const supabase = require('../config/supabase');
const notificationService = require('../services/notificationService');
const analyticsService = require('../services/analyticsService');
const { policyFromSettings } = require('../utils/bookingPolicy');
const {
  authenticateJWT,
  requireTenantMatch,
  requireRoles
} = require('../middlewares/authMiddleware');

const ALL_ROLES = ['OWNER', 'MANAGER', 'STAFF'];
const MANAGEMENT_ROLES = ['OWNER', 'MANAGER'];

/**
 * 0. POST /api/admin/login (retired)
 * The legacy demo login accepted any password and issued unsigned tokens.
 * Real authentication lives at POST /api/auth/login (JWT).
 */
router.post('/login', (req, res) => {
  return res.status(410).json({
    success: false,
    error: { message: 'This endpoint has been retired. Use POST /api/auth/login.' }
  });
});

// Every route below requires a valid JWT session (401 otherwise)
router.use(authenticateJWT);

/**
 * Ensures the reservation in :id belongs to the authenticated restaurant.
 * Responds 404 (not 403) so other tenants' reservation ids are not confirmed to exist.
 */
async function requireOwnReservation(req, res, next) {
  try {
    const reservation = await reservationService.getReservationById(req.params.id);

    if (!reservation || String(reservation.restaurant_id) !== String(req.user.restaurant_id)) {
      return res.status(404).json({
        success: false,
        error: { message: 'Reservation not found.' }
      });
    }

    req.reservation = reservation;
    return next();
  } catch (err) {
    console.error('[Admin Reservation Ownership Check] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to verify reservation ownership.' }
    });
  }
}

/**
 * 1. GET /api/admin/:restaurant_id/reservations
 */
router.get('/:restaurant_id/reservations', requireTenantMatch, requireRoles(ALL_ROLES), async (req, res) => {
  const restaurant_id = req.user.restaurant_id;
  const { status, date, sort = 'created_at', order = 'desc' } = req.query;

  try {
    const reservations = await reservationService.getReservationsByRestaurant(restaurant_id, {
      status,
      date,
      sort,
      order
    });

    return res.status(200).json({
      success: true,
      restaurant_id,
      count: reservations.length,
      data: reservations
    });
  } catch (err) {
    console.error(`[GET /api/admin/${restaurant_id}/reservations] Error:`, err);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error fetching reservations', details: err.message }
    });
  }
});

/**
 * 2. POST /api/admin/:restaurant_id/reservations - Staff manual booking
 */
router.post('/:restaurant_id/reservations', requireTenantMatch, requireRoles(ALL_ROLES), async (req, res) => {
  try {
    const restaurant_id = req.user.restaurant_id;
    const settings = await availabilityService.getSettings(restaurant_id);

    // Staff bookings are not limited by guest booking policies, but use the
    // restaurant's default reservation duration
    const reservation = await reservationService.createReservation({
      ...req.body,
      restaurant_id,
      duration_minutes: req.body.duration_minutes || policyFromSettings(settings).reservation_duration_minutes,
      status: req.body.status || 'CONFIRMED',
      source: req.body.source || 'MANUAL'
    });

    await notificationService.onReservationCreated(reservation, { source: 'MANUAL', settings });

    return res.status(201).json({
      success: true,
      message: 'Admin manual reservation created successfully',
      data: reservation
    });
  } catch (err) {
    console.error('[Admin Manual Booking] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error creating reservation', details: err.message }
    });
  }
});

/**
 * 3. PATCH /api/admin/:restaurant_id/reservations/:id/status
 * Front-of-House Transitions: SEATED, COMPLETED, NO_SHOW, CANCELLED, CONFIRMED, DECLINED, PENDING
 */
router.patch('/:restaurant_id/reservations/:id/status', requireTenantMatch, requireRoles(ALL_ROLES), requireOwnReservation, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Reservation ID is required.' }
      });
    }

    const validStatusesUpper = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DECLINED'];
    const rawUpper = (status || '').toUpperCase().trim();
    const rawLower = (status || '').toLowerCase().trim();
    const normalizedStatus = (rawLower === 'cancelled' || rawLower === 'canceled') ? 'CANCELLED' : rawUpper;

    if (!normalizedStatus || !validStatusesUpper.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid status. Allowed values: ${validStatusesUpper.join(', ')} (or lowercase equivalents)` }
      });
    }

    const updated = await reservationService.updateReservationStatus(id, rawLower);

    if (!updated) {
      // Ownership was verified above, so a missing result is a failed database write
      return res.status(500).json({
        success: false,
        error: { message: 'Reservation status could not be saved.' }
      });
    }

    // Guest email according to this restaurant's notification preferences
    await notificationService.onStatusChanged(
      { ...req.reservation, ...updated, restaurant_id: req.user.restaurant_id },
      normalizedStatus
    );

    return res.status(200).json({
      success: true,
      message: `Reservation status transitioned to '${normalizedStatus}'`,
      data: updated
    });
  } catch (err) {
    console.error('[Admin Status Update] Error:', err);
    return res.status(400).json({
      success: false,
      error: { message: err.message || 'Database row update failed' }
    });
  }
});

/**
 * 3.1. PATCH /api/admin/:restaurant_id/reservations/:id/vip - Toggle VIP Star on Floor View
 */
router.patch('/:restaurant_id/reservations/:id/vip', requireTenantMatch, requireRoles(ALL_ROLES), requireOwnReservation, async (req, res) => {
  const restaurant_id = req.user.restaurant_id;
  const { id } = req.params;
  const { is_vip } = req.body;

  try {
    const updated = await reservationService.toggleReservationVip(restaurant_id, id, is_vip);
    return res.status(200).json({
      success: true,
      message: `Guest VIP status updated to ${is_vip ? 'VIP' : 'Standard'}`,
      data: updated
    });
  } catch (err) {
    console.error('[Admin VIP Toggle] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to update VIP status' }
    });
  }
});

/**
 * 4. GET /api/admin/:restaurant_id/customers & /api/admin/:restaurant_id/crm - Guest CRM Directory
 */
const handleGetCrmCustomers = async (req, res) => {
  // Tenant comes from the session; any supplied id was already validated by requireTenantMatch
  const restaurant_id = req.user.restaurant_id;
  const { q } = req.query;

  try {
    const customers = await reservationService.getCustomersByRestaurant(restaurant_id, q);
    return res.status(200).json({
      success: true,
      restaurant_id,
      count: customers.length,
      data: customers,
      guests: customers
    });
  } catch (err) {
    console.error('[CRM Fetch Error]:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch customer CRM records', details: err.message },
      data: [],
      guests: []
    });
  }
};

// CRM is limited to OWNER/MANAGER (STAFF only works the reservation floor)
router.get('/crm', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), handleGetCrmCustomers);
router.get('/:restaurant_id/customers', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), handleGetCrmCustomers);
router.get('/:restaurant_id/crm', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), handleGetCrmCustomers);

/**
 * 5. PATCH /api/admin/:restaurant_id/customers/:id - Update VIP Tags & Guest Notes
 */
router.patch('/:restaurant_id/customers/:id', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { tags, notes, is_vip, phone, email, name } = req.body;

  try {
    const updated = await reservationService.updateCustomer(req.user.restaurant_id, id, { tags, notes, is_vip, phone, email, name });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { message: 'Guest profile not found.' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Guest profile updated',
      data: updated
    });
  } catch (err) {
    console.error('[CRM Update Error]:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to update customer profile', details: err.message }
    });
  }
});

/**
 * 6. GET & PATCH /api/admin/:restaurant_id/settings - Capacity & Rules Configuration
 */
router.get('/:restaurant_id/settings', requireTenantMatch, requireRoles(ALL_ROLES), async (req, res) => {
  try {
    const settings = await availabilityService.getSettings(req.user.restaurant_id);
    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

const handleAdminSettingsUpdate = async (req, res) => {
  try {
    const updated = await availabilityService.updateSettings(req.user.restaurant_id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Restaurant settings and operating hours saved',
      data: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
};

router.patch('/:restaurant_id/settings', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), handleAdminSettingsUpdate);

/**
 * 7. GET /api/admin/:restaurant_id/analytics?days=7|30|90
 * Read-only KPIs for the authenticated restaurant (no guest PII). RBAC: OWNER, MANAGER
 */
router.get('/:restaurant_id/analytics', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), async (req, res) => {
  try {
    const analytics = await analyticsService.getRestaurantAnalytics(req.user.restaurant_id, {
      days: parseInt(req.query.days, 10) || 30
    });
    return res.status(200).json({ success: true, data: analytics });
  } catch (err) {
    console.error('[GET /api/admin/:restaurant_id/analytics] Error:', err.code || '', err.message);
    return res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'ANALYTICS_LOAD_FAILED',
        message: err.code ? err.message : 'Analytics could not be loaded.'
      }
    });
  }
});
router.put('/:restaurant_id/settings', requireTenantMatch, requireRoles(MANAGEMENT_ROLES), handleAdminSettingsUpdate);

module.exports = router;
