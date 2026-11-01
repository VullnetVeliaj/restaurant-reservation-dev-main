const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const availabilityService = require('../services/availabilityService');
const { hashPassword } = require('../utils/auth');
const restaurantProfileService = require('../services/restaurantProfileService');
const { POLICY_FIELDS, NOTIFICATION_FIELDS } = require('../utils/bookingPolicy');
const { createLimiter } = require('../middlewares/rateLimiters');
const { authenticateJWT, requireTenantMatch, requireRoles } = require('../middlewares/authMiddleware');
// authRoutes no longer exports this in-memory fallback; default it so handlers don't crash
const { localRestaurantsStore = {} } = require('./authRoutes');

/**
 * 1. GET /api/settings & GET /api/settings/:restaurant_id
 * Returns singleton restaurant settings, operating_hours, capacity, and branding
 */
const handleGetSettings = async (req, res) => {
  const restaurant_id = req.params.restaurant_id;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'restaurant_id is required.'
      }
    });
  }

  try {
    let restaurant = localRestaurantsStore[restaurant_id];

    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurant_id)
        .single();

      if (!error && data) {
        restaurant = data;
      }
    } catch (e) {
      console.warn('[Settings Restaurant Lookup]', e.message);
    }

    const settings = await availabilityService.getSettings(
      restaurant_id
    );

    // Which optional sections the database supports, so the UI never offers
    // fields that cannot be persisted
    const capabilities = {
      ...availabilityService.getCapabilities(settings),
      profile: restaurantProfileService.hasProfileColumns(restaurant),
      logo_upload: await restaurantProfileService.isLogoStorageAvailable(),
      // Needs both the column and the bucket from migration 2026-10-10
      cover_upload: Boolean(restaurant) && 'cover_image_url' in restaurant &&
        await restaurantProfileService.isCoverStorageAvailable()
    };

    return res.status(200).json({
      success: true,
      restaurant_id,
      capabilities,
      restaurant: restaurant || {
        id: restaurant_id,
        name:
          settings.branding?.restaurant_name ||
          'Restaurant',
        primary_color:
          settings.branding?.primary_color ||
          '#D4A373'
      },
      data: settings,
      settings,
      branding: settings.branding,
      operating_hours:
        settings.operating_hours
    });
  } catch (err) {
    console.error(
      '[GET /api/settings/:restaurant_id] Error:',
      err.code || '',
      err.message
    );

    return res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'SETTINGS_LOAD_FAILED',
        message: err.code ? err.message : 'Failed to fetch restaurant settings'
      }
    });
  }
};


router.get(

  '/:restaurant_id',

  authenticateJWT,

  requireTenantMatch,

  handleGetSettings

);

/**
 * 2. PUT /api/settings & POST /api/settings & PUT/POST/PATCH /:restaurant_id
 * Singleton upsert for restaurant branding, 7-day multi-shift operating_hours, and capacity settings
 */
const handleUpdateSettings = async (req, res) => {
  const restaurant_id =
    req.params.restaurant_id;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'restaurant_id is required.'
      }
    });
  }

  const {
    name,
    restaurant_name,
    primary_color,
    bg_color,
    branding,
    operating_hours,
    timezone,
    profile,
    max_covers_per_slot,
    slot_interval_minutes,
    min_advance_notice_mins,
    max_advance_days
  } = req.body;

  try {
    // Validate the business profile before any write, so a bad field never
    // leaves the settings half-saved
    let profileValues = null;
    if (profile !== undefined) {
      const { data: restaurantRow, error: restaurantError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurant_id)
        .single();

      if (restaurantError || !restaurantRow) {
        throw Object.assign(new Error('Restaurant could not be loaded.'), { code: 'PROFILE_SAVE_FAILED', status: 500 });
      }
      if (!restaurantProfileService.hasProfileColumns(restaurantRow)) {
        throw Object.assign(new Error('Restaurant profile requires database migration 2026-10-09.'), { code: 'SETTINGS_SCHEMA_MISSING', status: 409 });
      }
      profileValues = restaurantProfileService.sanitizeProfile(profile);
    }

    // Booking policies & notification preferences (validated in updateSettings)
    const optionalSettings = {};
    for (const field of [...POLICY_FIELDS, ...NOTIFICATION_FIELDS]) {
      if (req.body[field] !== undefined) optionalSettings[field] = req.body[field];
    }

    const resolvedName = (name || restaurant_name || branding?.restaurant_name || '').trim();
    const resolvedPrimaryColor = (primary_color || branding?.primary_color || '').trim();
    const resolvedBgColor = (bg_color || branding?.bg_color || '').trim();

    // 1. Save restaurant_settings first. updateSettings also syncs restaurants.name/primary_color
    //    only after that write succeeded, so a failed save never leaves branding half-updated.
    const updatedSettings = await availabilityService.updateSettings(restaurant_id, {
      operating_hours,
      branding: {
        primary_color: resolvedPrimaryColor || undefined,
        bg_color: resolvedBgColor || undefined,
        restaurant_name: resolvedName || undefined
      },
      name: resolvedName,
      primary_color: resolvedPrimaryColor,
      bg_color: resolvedBgColor,
      max_covers_per_slot,
      slot_interval_minutes: 30, // enforced
      min_advance_notice_mins,
      max_advance_days,
      timezone,
      ...optionalSettings
    });

    // 2. Business profile (logo is managed only via the dedicated upload endpoint)
    const updatedRestaurant = profileValues
      ? await restaurantProfileService.updateProfile(restaurant_id, profileValues)
      : null;

    return res.status(200).json({
      success: true,
      message: 'Settings saved and synced successfully',
      restaurant_id,
      restaurant: updatedRestaurant || localRestaurantsStore[restaurant_id] || { id: restaurant_id, name: resolvedName || 'Restaurant', primary_color: resolvedPrimaryColor || '#D4A373' },
      data: updatedSettings,
      settings: updatedSettings,
      branding: updatedSettings.branding,
      operating_hours: updatedSettings.operating_hours
    });
  } catch (err) {
    console.error('[Settings Update Error]:', err.code || '', err.message);
    return res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'SETTINGS_SAVE_FAILED',
        // Typed service errors carry safe messages; anything else stays generic
        message: err.code ? err.message : 'Failed to update settings',
        ...(err.field ? { field: err.field } : {})
      }
    });
  }
};



router.put(

  '/:restaurant_id',

  authenticateJWT,

  requireTenantMatch,

  requireRoles(['OWNER', 'MANAGER']),

  handleUpdateSettings

);

router.post(

  '/:restaurant_id',

  authenticateJWT,

  requireTenantMatch,

  requireRoles(['OWNER', 'MANAGER']),

  handleUpdateSettings

);

router.patch(

  '/:restaurant_id',

  authenticateJWT,

  requireTenantMatch,

  requireRoles(['OWNER', 'MANAGER']),

  handleUpdateSettings

);

/**
 * 2b. POST /api/settings/:restaurant_id/logo   (body: raw PNG/JPEG/WebP, max 2 MB)
 *     DELETE /api/settings/:restaurant_id/logo
 * Stores the logo in Supabase Storage via the backend and saves only its public URL.
 * RBAC: OWNER, MANAGER (same policy as other restaurant settings)
 */
const logoLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Zu viele Logo-Uploads. Bitte versuchen Sie es in einigen Minuten erneut.'
});

const readLogoBody = (req, res, next) => {
  express.raw({
    type: Object.keys(restaurantProfileService.LOGO_TYPES),
    limit: restaurantProfileService.MAX_LOGO_BYTES
  })(req, res, (err) => {
    if (err) {
      const tooLarge = err.type === 'entity.too.large';
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        error: {
          code: tooLarge ? 'LOGO_TOO_LARGE' : 'UNSUPPORTED_LOGO_TYPE',
          message: tooLarge ? 'The logo must be 2 MB or smaller.' : 'The logo upload could not be read.'
        }
      });
    }
    return next();
  });
};

const sendProfileError = (res, err, fallbackCode) => res.status(err.status || 500).json({
  success: false,
  error: {
    code: err.code || fallbackCode,
    message: err.code ? err.message : 'The request could not be completed.'
  }
});

router.post('/:restaurant_id/logo', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), logoLimiter, readLogoBody, async (req, res) => {
  try {
    const declaredType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const logoUrl = await restaurantProfileService.uploadLogo(req.user.restaurant_id, req.body, declaredType);
    return res.status(200).json({ success: true, data: { logo_url: logoUrl } });
  } catch (err) {
    console.error('[POST /api/settings/:restaurant_id/logo] Error:', err.code || '', err.message);
    return sendProfileError(res, err, 'LOGO_UPLOAD_FAILED');
  }
});

router.delete('/:restaurant_id/logo', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    await restaurantProfileService.removeLogo(req.user.restaurant_id);
    return res.status(200).json({ success: true, data: { logo_url: null } });
  } catch (err) {
    console.error('[DELETE /api/settings/:restaurant_id/logo] Error:', err.code || '', err.message);
    return sendProfileError(res, err, 'LOGO_SAVE_FAILED');
  }
});

/**
 * 2c. Cover photo (public homepage card), PNG/JPEG/WebP up to 5 MB
 *     POST   /api/settings/:restaurant_id/cover/upload-url  { content_type, size }
 *            -> signed upload URL for a file in the caller's own restaurant folder
 *     POST   /api/settings/:restaurant_id/cover/confirm     { path }
 *            -> backend validates the uploaded bytes and saves the public URL
 *     DELETE /api/settings/:restaurant_id/cover
 * The restaurant always comes from the JWT (req.user.restaurant_id).
 * RBAC: OWNER, MANAGER
 */
const coverLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Zu viele Foto-Uploads. Bitte versuchen Sie es in einigen Minuten erneut.'
});

router.post('/:restaurant_id/cover/upload-url', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), coverLimiter, async (req, res) => {
  try {
    const declaredType = String(req.body?.content_type || '').toLowerCase();
    const upload = await restaurantProfileService.createCoverUpload(req.user.restaurant_id, declaredType, req.body?.size);
    return res.status(200).json({ success: true, data: upload });
  } catch (err) {
    console.error('[POST /api/settings/:restaurant_id/cover/upload-url] Error:', err.code || '', err.message);
    return sendProfileError(res, err, 'COVER_UPLOAD_FAILED');
  }
});

router.post('/:restaurant_id/cover/confirm', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const coverUrl = await restaurantProfileService.confirmCoverUpload(req.user.restaurant_id, req.body?.path);
    return res.status(200).json({ success: true, data: { cover_image_url: coverUrl } });
  } catch (err) {
    console.error('[POST /api/settings/:restaurant_id/cover/confirm] Error:', err.code || '', err.message);
    return sendProfileError(res, err, 'COVER_UPLOAD_FAILED');
  }
});

router.delete('/:restaurant_id/cover', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    await restaurantProfileService.removeCover(req.user.restaurant_id);
    return res.status(200).json({ success: true, data: { cover_image_url: null } });
  } catch (err) {
    console.error('[DELETE /api/settings/:restaurant_id/cover] Error:', err.code || '', err.message);
    return sendProfileError(res, err, 'COVER_SAVE_FAILED');
  }
});

/**
 * Staff management helpers
 */
const STAFF_COLUMNS = 'id, restaurant_id, email, full_name, role, is_active, created_at';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASSIGNABLE_ROLES = ['STAFF', 'MANAGER'];

// Defence in depth: never send credential fields, whatever the query returned
function toSafeStaff(user) {
  if (!user) return user;
  const { password_hash, session_version, ...safe } = user;
  return safe;
}

function sendStaffError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function isDbPermissionError(dbError) {
  return dbError?.code === '42501' || /row-level security|permission denied/i.test(dbError?.message || '');
}

/**
 * 3. GET /api/settings/:restaurant_id/staff
 * Lists staff accounts for this restaurant
 * RBAC: OWNER, MANAGER
 */
router.get('/:restaurant_id/staff', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), async (req, res) => {
  // Tenant comes from the session (requireTenantMatch already validated the path)
  const restaurant_id = req.user.restaurant_id;

  const { data, error } = await supabase
    .from('restaurant_users')
    .select(STAFF_COLUMNS)
    .eq('restaurant_id', restaurant_id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GET /api/settings/:restaurant_id/staff] Error:', error.code || '', error.message);
    return sendStaffError(
      res, 500,
      isDbPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'STAFF_LOAD_FAILED',
      'The team could not be loaded.'
    );
  }

  return res.status(200).json({
    success: true,
    restaurant_id,
    count: data.length,
    data: data.map(toSafeStaff)
  });
});

/**
 * 4. POST /api/settings/:restaurant_id/staff
 * Creates a new staff or manager account for the authenticated restaurant.
 * RBAC: OWNER and MANAGER may add STAFF; only OWNER may add MANAGER.
 */
router.post('/:restaurant_id/staff', authenticateJWT, requireTenantMatch, requireRoles(['OWNER', 'MANAGER']), async (req, res) => {
  const restaurant_id = req.user.restaurant_id;
  const { full_name, email, role = 'STAFF', password } = req.body || {};

  const cleanName = typeof full_name === 'string' ? full_name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
  const requestedRole = typeof role === 'string' ? role.toUpperCase().trim() : '';

  if (!cleanName || cleanName.length > 120) {
    return sendStaffError(res, 400, 'INVALID_NAME', 'A full name (max 120 characters) is required.');
  }

  if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
    return sendStaffError(res, 400, 'INVALID_EMAIL', 'A valid email address is required.');
  }

  if (requestedRole === 'OWNER' || (requestedRole === 'MANAGER' && req.user.role !== 'OWNER')) {
    return sendStaffError(res, 403, 'ROLE_NOT_ALLOWED', 'Only the restaurant Owner can assign Manager permissions.');
  }

  if (!ASSIGNABLE_ROLES.includes(requestedRole)) {
    return sendStaffError(res, 400, 'INVALID_ROLE', 'Role must be STAFF or MANAGER.');
  }

  // Same rule as the account password change
  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return sendStaffError(res, 400, 'WEAK_PASSWORD', 'The password must be at least 8 characters and contain a letter and a number.');
  }

  try {
    const nowIso = new Date().toISOString();

    // id is generated by the database (UUID). The account is created and vouched for by the
    // restaurant owner/manager, so it is marked verified; otherwise the new member could never sign in.
    const { data: created, error } = await supabase
      .from('restaurant_users')
      .insert([{
        restaurant_id,
        email: cleanEmail,
        password_hash: await hashPassword(password),
        full_name: cleanName,
        role: requestedRole,
        is_active: true,
        email_verified: true,
        email_verified_at: nowIso,
        session_version: 0,
        created_at: nowIso,
        updated_at: nowIso
      }])
      .select(STAFF_COLUMNS)
      .single();

    if (error) {
      console.error('[POST /api/settings/:restaurant_id/staff] Insert error:', error.code || '', error.message);

      if (error.code === '23505') {
        return sendStaffError(res, 409, 'EMAIL_TAKEN', 'An account with this email address already exists.');
      }

      return sendStaffError(
        res, 500,
        isDbPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'STAFF_CREATE_FAILED',
        'The team member could not be created.'
      );
    }

    return res.status(201).json({
      success: true,
      message: `Staff member ${created.full_name} (${created.role}) created successfully.`,
      data: toSafeStaff(created)
    });
  } catch (err) {
    console.error('[POST /api/settings/:restaurant_id/staff] Error:', err.message);
    return sendStaffError(res, 500, 'STAFF_CREATE_FAILED', 'The team member could not be created.');
  }
});

/**
 * 5. DELETE /api/settings/:restaurant_id/staff/:id
 * Revokes a staff/manager account of the authenticated restaurant
 * RBAC: OWNER
 */
router.delete('/:restaurant_id/staff/:id', authenticateJWT, requireTenantMatch, requireRoles(['OWNER']), async (req, res) => {
  const restaurant_id = req.user.restaurant_id;
  const { id } = req.params;

  if (req.user.userId === id) {
    return sendStaffError(res, 400, 'CANNOT_REVOKE_SELF', 'You cannot revoke your own Owner account.');
  }

  // Owner accounts cannot be revoked here (prevents locking the restaurant out)
  const { data, error } = await supabase
    .from('restaurant_users')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurant_id)
    .neq('role', 'OWNER')
    .select('id');

  if (error && error.code !== '22P02') {
    console.error('[DELETE /api/settings/:restaurant_id/staff/:id] Error:', error.code || '', error.message);
    return sendStaffError(
      res, 500,
      isDbPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'STAFF_REVOKE_FAILED',
      'Access could not be revoked.'
    );
  }

  if (error || !data || data.length === 0) {
    return sendStaffError(res, 404, 'STAFF_NOT_FOUND', 'Team member not found.');
  }

  return res.status(200).json({
    success: true,
    message: 'Staff account access revoked successfully.'
  });
});

module.exports = router;
