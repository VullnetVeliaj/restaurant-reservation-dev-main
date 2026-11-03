const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationService');
const availabilityService = require('../services/availabilityService');
const notificationService = require('../services/notificationService');
const { resolvePublicRestaurantId, sendResolverError } = require('../utils/restaurantResolver');
const {
  evaluateBookingRequest,
  policyFromSettings,
  canGuestCancel
} = require('../utils/bookingPolicy');
const {
  authenticateJWT,
  requireTenantMatch
} = require('../middlewares/authMiddleware');
const {
  publicBookingLimiter,
  cancellationLimiter,
  lookupLimiter
} = require('../middlewares/rateLimiters');

/**
 * Data-minimised reservation shape for unauthenticated guests.
 * Never includes internal CRM flags (VIP, tags, no-show counts), table
 * assignments or the stored cancellation_token_hash.
 */
function toPublicReservation(record, { includeCancellationToken = false } = {}) {
  if (!record) return null;

  const bookingCode =
    record.booking_code ||
    String(record.id || '').trim().split('-')[0].toUpperCase();

  const publicReservation = {
    id: record.id,
    booking_code: bookingCode,
    restaurant_id: record.restaurant_id,
    status: record.status,
    name: record.name || record.customer_name,
    email: record.email || record.customer_email,
    phone: record.phone || record.customer_phone,
    guests: record.guests || record.party_size,
    date: record.date || record.reservation_date,
    time: record.time || record.reservation_time,
    special_requests: record.special_requests || null,
    created_at: record.created_at,
    // Legacy aliases kept for existing widget/frontends
    customer_name: record.name || record.customer_name,
    customer_email: record.email || record.customer_email,
    customer_phone: record.phone || record.customer_phone,
    party_size: record.guests || record.party_size,
    reservation_date: record.date || record.reservation_date,
    reservation_time: record.time || record.reservation_time
  };

  // The plaintext token is only ever returned once, to the guest who just booked
  if (includeCancellationToken && record.cancellation_token) {
    publicReservation.cancellation_token = record.cancellation_token;
  }

  return publicReservation;
}
/**
 * 0. GET /api/reservations/availability
 * Computes slot availability, active shifts, and remaining covers
 * Query params: ?restaurant_id=xxx&date=YYYY-MM-DD&party_size=N
 */
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
    console.error('[GET /api/reservations/availability] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to calculate availability slots', details: err.message }
    });
  }
});

/**
 * 0.05. GET /api/reservations
 * Fetch all reservations for tenant with guaranteed schema columns and in-memory VIP resolution
 */
router.get(
  '/',
  authenticateJWT,
  requireTenantMatch,
  async (req, res) => {
  try {
    // Always scope to the authenticated restaurant (never default to another tenant)
    const restaurant_id = req.user.restaurant_id;
    const { status, date, sort, order } = req.query;

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
    console.error('[GET /api/reservations] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error fetching reservations', details: err.message }
    });
  }
});

/**
 * 0.1. GET & POST /api/reservations/guest-check
 * Read-only guest status check (VIP detection and 3-strike no-show validation).
 * Returns restaurant-private CRM data, so it is restricted to the restaurant's own
 * signed-in team. Public bookings run the same check server-side inside createReservation.
 */
const handleGuestCheck = async (req, res) => {
  try {
    const restaurant_id = req.user.restaurant_id;
    const phone = req.query.phone || req.body.phone || null;
    const email = req.query.email || req.body.email || null;
    const name = req.query.name || req.body.name || null;

    const guestStatus = await reservationService.checkGuestStatus(restaurant_id, { phone, email, name });

    return res.status(200).json({
      success: true,
      data: guestStatus
    });
  } catch (err) {
    console.error('[Guest Check Error]:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to verify guest status', details: err.message }
    });
  }
};

router.get('/guest-check', lookupLimiter, authenticateJWT, requireTenantMatch, handleGuestCheck);
router.post('/guest-check', lookupLimiter, authenticateJWT, requireTenantMatch, handleGuestCheck);

/**
 * 1. POST /api/reservations
 * Validates capacity, enforces 3-strike block & VIP tag, creates booking, and upserts Guest CRM profile
 */
router.post('/', publicBookingLimiter, async (req, res) => {
  try {
    const {
      name,
      customer_name,
      email,
      customer_email,
      phone,
      customer_phone,
      guests,
      party_size,
      date,
      reservation_date,
      time,
      reservation_time,
      special_requests
    } = req.body;

    const resolvedName = (name || customer_name || '').trim();
    const resolvedEmail = (email || customer_email || '').trim() || null;
    const resolvedPhone = (phone || customer_phone || '').trim() || null;
    const resolvedGuests = parseInt(guests || party_size || 2, 10);
    const resolvedDate = (date || reservation_date || '').trim();
    const resolvedTime = (time || reservation_time || '').trim();

    // Never default a public booking into another tenant: the restaurant is derived
    // from the public widget key when present (browser restaurant_id is then ignored)
    let restaurant_id;
    try {
      restaurant_id = await resolvePublicRestaurantId(req);
    } catch (resolveErr) {
      return sendResolverError(res, resolveErr);
    }

    if (!resolvedName || !resolvedGuests || !resolvedDate || !resolvedTime) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required reservation fields: name, guests, date, and time are required.' }
      });
    }

    // The restaurant's own settings drive every booking policy below
    let settings;
    try {
      settings = await availabilityService.getSettings(restaurant_id);
    } catch (settingsErr) {
      if (settingsErr.code === 'SETTINGS_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'RESTAURANT_NOT_FOUND', message: 'Dieses Restaurant wurde nicht gefunden.' }
        });
      }
      throw settingsErr;
    }

    // Booking policies: party size, booking window, same-day bookings (restaurant time)
    const violation = evaluateBookingRequest(settings, { date: resolvedDate, partySize: resolvedGuests });
    if (violation) {
      return res.status(violation.status).json({
        success: false,
        error: { code: violation.code, message: violation.message }
      });
    }

    // Capacity, opening hours and minimum notice per slot. A failed check never lets a
    // booking through unchecked (overbooking risk).
    const validation = await availabilityService.validateSlotCapacity(
      restaurant_id,
      resolvedDate,
      resolvedTime,
      resolvedGuests
    );

    if (validation && validation.valid === false) {
      const noticePassed = validation.reason === 'Advance notice passed';
      return res.status(409).json({
        success: false,
        error: {
          code: noticePassed ? 'ADVANCE_NOTICE_REQUIRED' : 'CAPACITY_EXCEEDED',
          message: noticePassed
            ? 'Diese Uhrzeit liegt innerhalb der Mindestvorlaufzeit des Restaurants. Bitte wählen Sie eine spätere Uhrzeit.'
            : `The selected time slot (${resolvedTime}) cannot accommodate ${resolvedGuests} guests. Please select another time slot.`,
          remaining_covers: validation.remaining_covers,
          reason: validation.reason
        }
      });
    }

    const policy = policyFromSettings(settings);

    // Create reservation with automatic VIP tagging, 3-strike block, and multi-stage fallback
    const createdReservation = await reservationService.createReservation({
      restaurant_id,
      name: resolvedName,
      email: resolvedEmail,
      phone: resolvedPhone,
      guests: resolvedGuests,
      date: resolvedDate,
      time: resolvedTime,
      special_requests,
      duration_minutes: policy.reservation_duration_minutes,
      // Automatic vs manual confirmation is a per-restaurant policy
      status: policy.auto_confirm ? 'CONFIRMED' : 'PENDING',
      source: 'WEB'
    });

    // Guest / owner emails according to this restaurant's notification preferences
    await notificationService.onReservationCreated(createdReservation, { source: 'WEB', settings });

    return res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: toPublicReservation(createdReservation, { includeCancellationToken: true })
    });
  } catch (err) {
    if (err.code === 'NO_SHOW_STRIKE_LIMIT' || err.status === 403) {
      // Do not disclose CRM history (no-show count) to an anonymous caller
      return res.status(403).json({
        success: false,
        blocked: true,
        code: 'NO_SHOW_STRIKE_LIMIT',
        error: {
          message:
            'Online-Reservierungen sind für diese Kontaktdaten derzeit nicht möglich. Bitte kontaktieren Sie das Restaurant telefonisch.'
        }
      });
    }

    console.error('[POST /api/reservations] Unhandled exception:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error processing reservation', details: err.message }
    });
  }
});

/**
 * Helper to resolve optional restaurant scoping on guest lookup/cancel
 */
async function resolveOptionalRestaurantId(req) {
  const hasWidgetOrRest =
    (req.query && (req.query.widget_key || req.query.restaurant_id)) ||
    (req.body && (req.body.widget_key || req.body.restaurant_id));
  if (!hasWidgetOrRest) return null;
  try {
    return await resolvePublicRestaurantId(req);
  } catch (e) {
    return null;
  }
}

/**
 * 2a. GET /api/reservations/lookup/:code
 * Public guest lookup by short 8-char reservation code, UUID, or cancellation token.
 * Returns only guest-facing fields (toPublicReservation).
 */
router.get('/lookup/:code', lookupLimiter, async (req, res) => {
  const { code } = req.params;
  try {
    if (!code || !String(code).trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Bitte geben Sie Ihren Reservierungscode ein.' }
      });
    }

    const restaurantId = await resolveOptionalRestaurantId(req);
    const reservation = await reservationService.getReservationByCodeOrId(code, { restaurantId });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: { message: 'Keine Reservierung mit diesem Code gefunden.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: toPublicReservation(reservation)
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      error: { message: 'Keine Reservierung mit diesem Code gefunden.', details: err.message }
    });
  }
});

/**
 * 2b. GET /api/reservations/:id
 * Look up a single reservation by short code or UUID.
 * - Authenticated staff/admin receives full tenant-scoped record.
 * - Unauthenticated guest receives data-minimised public reservation shape.
 */
router.get(
  '/:id',
  lookupLimiter,
  async (req, res, next) => {
    if (req.headers.authorization) {
      return authenticateJWT(req, res, next);
    }
    return next();
  },
  async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({
        success: false,
        error: { message: 'Reservation code or UUID is required.' }
      });
    }

    // Staff / Admin path
    if (req.user) {
      const reservation = await reservationService.getReservationByCodeOrId(id);

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: { message: `Reservation with ID '${id}' was not found.` }
        });
      }

      if (reservation.restaurant_id !== req.user.restaurant_id) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Sie haben keine Berechtigung, diese Reservierung aufzurufen.'
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: reservation
      });
    }

    // Public Guest path (widget & manage.html)
    const restaurantId = await resolveOptionalRestaurantId(req);
    const reservation = await reservationService.getReservationByCodeOrId(id, { restaurantId });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: { message: 'Keine Reservierung mit diesem Code gefunden.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: toPublicReservation(reservation)
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      error: { message: `Reservation with ID '${id}' was not found.`, details: err.message }
    });
  }
});

/**
 * 3. POST /api/reservations/cancel & PUT /:id/cancel & POST /:id/cancel & PATCH /:id/cancel
 * Client self-cancellation by short booking code, UUID, or cancellation token
 */
const handleCancelReservation = async (req, res) => {
  const tokenOrCode =
    req.body?.cancellation_token ||
    req.query?.cancellation_token ||
    req.body?.code ||
    req.query?.code ||
    req.body?.id ||
    req.params?.id;

  try {
    if (!tokenOrCode || !String(tokenOrCode).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Ein gültiger Reservierungscode oder Stornierungslink ist erforderlich.'
        }
      });
    }

    const restaurantId = await resolveOptionalRestaurantId(req);

    // Look up first so the restaurant's cancellation cutoff can be enforced
    let existing = await reservationService.getReservationByCancellationToken(tokenOrCode);
    if (!existing) {
      existing = await reservationService.getReservationByCodeOrId(tokenOrCode, { restaurantId });
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: 'Die Reservierung wurde nicht gefunden oder ist nicht mehr verfügbar.' }
      });
    }

    const settings = await availabilityService.getSettings(existing.restaurant_id);
    if (!canGuestCancel(settings, existing)) {
      const cutoffHours = policyFromSettings(settings).cancellation_cutoff_hours;
      return res.status(409).json({
        success: false,
        error: {
          code: 'CANCELLATION_CUTOFF',
          message: `Online-Stornierungen sind nur bis ${cutoffHours} Stunden vor der Reservierung möglich. Bitte kontaktieren Sie das Restaurant direkt.`
        }
      });
    }

    const updated = await reservationService.cancelReservation(tokenOrCode, { restaurantId });

    // Guest / owner emails according to this restaurant's notification preferences
    await notificationService.onGuestCancelled(updated, { settings });

    return res.status(200).json({
      success: true,
      message: 'Ihre Reservierung wurde erfolgreich storniert.',
      data: toPublicReservation(updated)
    });
  } catch (err) {
    if (err.code === 'INVALID_CANCELLATION_TOKEN') {
      return res.status(404).json({
        success: false,
        error: { message: 'Die Reservierung wurde nicht gefunden oder ist nicht mehr verfügbar.' }
      });
    }

    console.error('[Cancellation Endpoint Error]:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error cancelling reservation', details: err.message }
    });
  }
};

router.post('/cancel', cancellationLimiter, handleCancelReservation);
router.put('/:id/cancel', cancellationLimiter, handleCancelReservation);
router.post('/:id/cancel', cancellationLimiter, handleCancelReservation);
router.patch('/:id/cancel', cancellationLimiter, handleCancelReservation);

module.exports = router;
