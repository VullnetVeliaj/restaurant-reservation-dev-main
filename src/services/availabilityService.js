const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { allowLocalFallback } = require('../config/runtime');
const {
  POLICY_FIELDS,
  NOTIFICATION_FIELDS,
  isValidTimeZone,
  resolveTimeZone,
  nowInTimeZone,
  daysBetween,
  policyFromSettings,
  publicBookingPolicy,
  evaluateBookingRequest
} = require('../utils/bookingPolicy');

/**
 * Which optional settings groups the database supports (columns present in the row).
 * Lets the API refuse — instead of silently dropping — values it cannot persist.
 */
function settingsCapabilities(row = {}) {
  return {
    policies: 'min_party_size' in row,
    notifications: 'notify_guest_on_booking' in row
  };
}

const DATA_DIR = path.join(__dirname, '../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'restaurant_settings.json');

// Default fallback settings if DB table is unprovisioned
const DEFAULT_SETTINGS = {
  timezone: 'America/New_York',
  max_covers_per_slot: 20,
  slot_interval_minutes: 30,
  min_advance_notice_mins: 60,
  max_advance_days: 30
};

// Default 7-day Multi-Shift Operating Hours (Monday - Sunday)
const DEFAULT_OPERATING_HOURS = {
  monday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 20 },
      { name: 'Dinner', start_time: '18:00', end_time: '22:30', max_covers: 24 }
    ]
  },
  tuesday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 20 },
      { name: 'Dinner', start_time: '18:00', end_time: '22:30', max_covers: 24 }
    ]
  },
  wednesday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 20 },
      { name: 'Dinner', start_time: '18:00', end_time: '22:30', max_covers: 24 }
    ]
  },
  thursday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 20 },
      { name: 'Dinner', start_time: '18:00', end_time: '22:30', max_covers: 24 }
    ]
  },
  friday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 24 },
      { name: 'Dinner', start_time: '17:30', end_time: '23:00', max_covers: 30 }
    ]
  },
  saturday: {
    is_open: true,
    shifts: [
      { name: 'Brunch', start_time: '11:00', end_time: '15:00', max_covers: 24 },
      { name: 'Dinner', start_time: '17:00', end_time: '23:00', max_covers: 30 }
    ]
  },
  sunday: {
    is_open: true,
    shifts: [
      { name: 'Lunch', start_time: '12:00', end_time: '16:00', max_covers: 24 },
      { name: 'Dinner', start_time: '17:30', end_time: '21:30', max_covers: 20 }
    ]
  }
};

// restaurant_name stays empty so callers fall back to the tenant's own restaurants.name
const DEFAULT_BRANDING = {
  primary_color: '#D4A373',
  bg_color: '#A88B74',
  restaurant_name: ''
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Load initial persistent settings from disk if available
// Disk settings cache is development-only; production never reads or writes data/*.json
function loadPersistedSettings() {
  if (!allowLocalFallback) return {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

function savePersistedSettings(data) {
  if (!allowLocalFallback) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[AvailabilityService] Disk settings write error:', e.message);
  }
}

// In-memory tenant settings cache for instant fallback.
// Keyed strictly by restaurant_id — a shared 'default' entry must never be served to a tenant.
const localSettingsStore = loadPersistedSettings();
delete localSettingsStore['default'];
const localShiftsStore = {};

// Without Supabase credentials (local dev) the disk store is the only persistence layer
const SUPABASE_CONFIGURED = Boolean(
  process.env.SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY)
);

function buildDefaultSettings(restaurantId) {
  return {
    restaurant_id: restaurantId,
    ...DEFAULT_SETTINGS,
    operating_hours: JSON.parse(JSON.stringify(DEFAULT_OPERATING_HOURS)),
    branding: { ...DEFAULT_BRANDING }
  };
}

/**
 * Typed settings error: `code` and `status` are passed through to the API response
 * so the admin UI can show what actually went wrong (no raw DB text).
 */
function settingsError(message, code, status = 500) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// Supabase/PostgREST errors caused by Row Level Security or missing privileges
function isPermissionError(dbError) {
  const text = `${dbError?.message || ''} ${dbError?.details || ''}`;
  return dbError?.code === '42501' || /row-level security|permission denied/i.test(text);
}

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Same bounds as the admin form; values outside are rejected instead of silently changed
const SETTINGS_BOUNDS = {
  max_covers_per_slot: [1, 200],
  min_advance_notice_mins: [0, 1440],
  max_advance_days: [1, 365]
};

function parseJsonColumn(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) { return null; }
  }
  return value || null;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  return parts[0] * 60 + (parts[1] || 0);
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatDisplayTime(timeStr) {
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  const h = parts[0];
  const m = parts[1] || 0;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${displayHour}:${pad(m)} ${meridiem}`;
}

function normalizeDayKey(day) {
  if (typeof day === 'number') {
    return DAY_NAMES[day] || 'monday';
  }
  if (typeof day === 'string') {
    const lower = day.toLowerCase().trim();
    if (DAY_NAMES.includes(lower)) return lower;
    if (lower.startsWith('mon')) return 'monday';
    if (lower.startsWith('tue')) return 'tuesday';
    if (lower.startsWith('wed')) return 'wednesday';
    if (lower.startsWith('thu')) return 'thursday';
    if (lower.startsWith('fri')) return 'friday';
    if (lower.startsWith('sat')) return 'saturday';
    if (lower.startsWith('sun')) return 'sunday';
  }
  return 'monday';
}

class AvailabilityService {
  /**
   * Which optional settings groups this restaurant's settings row supports.
   */
  getCapabilities(settingsRow) {
    return settingsCapabilities(settingsRow);
  }

  /**
   * Fetch singleton settings for a restaurant tenant with Supabase & disk fallback
   */
  async getSettings(restaurantId, { allowMissing = false } = {}) {
    if (!restaurantId) {
      throw new Error('restaurant_id is required to load restaurant settings.');
    }

    // The per-tenant cache is a development fallback only
    const cached = allowLocalFallback ? localSettingsStore[restaurantId] : undefined;

    try {
      // Exactly one settings row per restaurant, looked up by restaurant_id only
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (error) throw error;

      // Every restaurant gets a settings row at registration (and via migration).
      // In production a missing row means misconfiguration (e.g. RLS hiding it), so it is
      // reported instead of silently serving default opening hours.
      if (!data && !allowLocalFallback && !allowMissing) {
        throw settingsError('Restaurant settings were not found.', 'SETTINGS_NOT_FOUND', 404);
      }

      if (data) {
        const stored = {
          ...DEFAULT_SETTINGS,
          ...data,
          restaurant_id: restaurantId,
          operating_hours:
            parseJsonColumn(data.operating_hours) ||
            cached?.operating_hours ||
            JSON.parse(JSON.stringify(DEFAULT_OPERATING_HOURS)),
          branding:
            parseJsonColumn(data.branding) ||
            cached?.branding ||
            { ...DEFAULT_BRANDING }
        };
        localSettingsStore[restaurantId] = stored;
        savePersistedSettings(localSettingsStore);
        return stored;
      }
    } catch (e) {
      if (SUPABASE_CONFIGURED) {
        console.warn(`[AvailabilityService] Settings lookup failed for ${restaurantId}:`, e.code || '', e.message);
      }
      // Production: a failed lookup is an error, not a reason to serve guessed settings
      if (!allowLocalFallback) {
        if (e.code === 'SETTINGS_NOT_FOUND') throw e;
        if (isPermissionError(e)) {
          throw settingsError('The database rejected access to restaurant settings (server key/permissions).', 'DB_PERMISSION_DENIED', 500);
        }
        throw settingsError('Restaurant settings could not be loaded.', 'SETTINGS_LOAD_FAILED', 500);
      }
    }

    // No row yet: fresh (unshared, unpersisted) defaults. In development, prefer this tenant's own cache.
    return cached || buildDefaultSettings(restaurantId);
  }

  /**
   * Update tenant singleton settings (operating hours, branding, capacity limits)
   */
  async updateSettings(restaurantId, newSettings = {}) {
    if (!restaurantId) {
      throw new Error('restaurant_id is required to save restaurant settings.');
    }

    // A missing row is fine here: the upsert below creates it
    const current = await this.getSettings(restaurantId, { allowMissing: true });

    // Numeric rules: 0 is a valid value (e.g. no minimum notice), so never use `||` here
    const numbers = {
      max_covers_per_slot: toInt(newSettings.max_covers_per_slot, toInt(current.max_covers_per_slot, DEFAULT_SETTINGS.max_covers_per_slot)),
      min_advance_notice_mins: toInt(newSettings.min_advance_notice_mins, toInt(current.min_advance_notice_mins, DEFAULT_SETTINGS.min_advance_notice_mins)),
      max_advance_days: toInt(newSettings.max_advance_days, toInt(current.max_advance_days, DEFAULT_SETTINGS.max_advance_days))
    };

    for (const [field, [min, max]] of Object.entries(SETTINGS_BOUNDS)) {
      if (numbers[field] < min || numbers[field] > max) {
        throw settingsError(`${field} must be between ${min} and ${max}.`, 'INVALID_SETTINGS', 400);
      }
    }

    // Timezone drives "today"/"now" for availability, notice, cutoffs and analytics
    let timezone = current.timezone || DEFAULT_SETTINGS.timezone;
    if (newSettings.timezone !== undefined) {
      if (!isValidTimeZone(newSettings.timezone)) {
        throw settingsError('timezone must be a valid IANA timezone (e.g. Europe/Berlin).', 'INVALID_SETTINGS', 400);
      }
      timezone = newSettings.timezone;
    }

    // Booking policies & notification preferences: only persisted where the
    // columns exist (migration 2026-10-09). Never accepted-and-dropped silently.
    const capabilities = settingsCapabilities(current);
    const policyAndNotificationValues = {};

    const requestedPolicy = POLICY_FIELDS.some((f) => newSettings[f] !== undefined);
    const requestedNotifications = NOTIFICATION_FIELDS.some((f) => newSettings[f] !== undefined);

    if ((requestedPolicy && !capabilities.policies) || (requestedNotifications && !capabilities.notifications)) {
      throw settingsError(
        'Booking policies / notification preferences require database migration 2026-10-09.',
        'SETTINGS_SCHEMA_MISSING',
        409
      );
    }

    if (capabilities.policies) {
      const pick = (field) => (newSettings[field] !== undefined ? newSettings[field] : current[field]);
      const policy = {
        min_party_size: toInt(pick('min_party_size'), NaN),
        max_party_size: toInt(pick('max_party_size'), NaN),
        reservation_duration_minutes: toInt(pick('reservation_duration_minutes'), NaN),
        cancellation_cutoff_hours: toInt(pick('cancellation_cutoff_hours'), NaN),
        auto_confirm: pick('auto_confirm'),
        same_day_booking: pick('same_day_booking')
      };

      const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
      if (
        !inRange(policy.min_party_size, 1, 100) ||
        !inRange(policy.max_party_size, 1, 500) ||
        policy.min_party_size > policy.max_party_size ||
        !inRange(policy.reservation_duration_minutes, 15, 480) ||
        policy.reservation_duration_minutes % 15 !== 0 ||
        !inRange(policy.cancellation_cutoff_hours, 0, 168) ||
        typeof policy.auto_confirm !== 'boolean' ||
        typeof policy.same_day_booking !== 'boolean'
      ) {
        throw settingsError('Booking policy values are invalid or out of range.', 'INVALID_SETTINGS', 400);
      }

      Object.assign(policyAndNotificationValues, policy);
    }

    if (capabilities.notifications) {
      for (const field of NOTIFICATION_FIELDS) {
        if (field === 'owner_notification_email') continue;
        const value = newSettings[field] !== undefined ? newSettings[field] : current[field];
        if (typeof value !== 'boolean') {
          throw settingsError(`${field} must be true or false.`, 'INVALID_SETTINGS', 400);
        }
        policyAndNotificationValues[field] = value;
      }

      const rawEmail = newSettings.owner_notification_email !== undefined
        ? newSettings.owner_notification_email
        : current.owner_notification_email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

      if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
        throw settingsError('owner_notification_email must be a valid email address.', 'INVALID_SETTINGS', 400);
      }
      policyAndNotificationValues.owner_notification_email = email || null;
    }

    // Sanitize operating hours if provided
    let operating_hours = current.operating_hours || JSON.parse(JSON.stringify(DEFAULT_OPERATING_HOURS));
    if (newSettings.operating_hours) {
      if (typeof newSettings.operating_hours === 'object') {
        const sanitized = {};
        for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
          const dayData = newSettings.operating_hours[day] || newSettings.operating_hours[day.charAt(0).toUpperCase() + day.slice(1)] || {};
          const shifts = Array.isArray(dayData.shifts)
            ? dayData.shifts.slice(0, 3).map((s, idx) => ({
                name: s.name ? String(s.name).trim() : `Shift ${idx + 1}`,
                start_time: s.start_time || '12:00',
                end_time: s.end_time || '22:00',
                max_covers: parseInt(s.max_covers || newSettings.max_covers_per_slot || 20, 10)
              }))
            : [];

          sanitized[day] = {
            is_open: dayData.is_open !== false,
            shifts
          };
        }
        operating_hours = sanitized;
      }
    }

    // Sanitize branding
    // Copy so the cached object for this tenant is never mutated before the DB write succeeds
    let branding = { ...(current.branding || DEFAULT_BRANDING) };
    if (newSettings.branding) {
      branding = {
        primary_color: newSettings.branding.primary_color || branding.primary_color || '#D4A373',
        bg_color: newSettings.branding.bg_color || branding.bg_color || '#A88B74',
        restaurant_name: newSettings.branding.restaurant_name || branding.restaurant_name || ''
      };
    }
    if (newSettings.primary_color) branding.primary_color = newSettings.primary_color;
    if (newSettings.bg_color) branding.bg_color = newSettings.bg_color;
    if (newSettings.name || newSettings.restaurant_name) branding.restaurant_name = newSettings.name || newSettings.restaurant_name;

    // No shared/global id: the row is identified solely by restaurant_id (UNIQUE)
    const payload = {
      restaurant_id: restaurantId,
      timezone,
      ...policyAndNotificationValues,
      max_covers_per_slot: numbers.max_covers_per_slot,
      slot_interval_minutes: 30, // strictly enforce 30-minute interval
      min_advance_notice_mins: numbers.min_advance_notice_mins,
      max_advance_days: numbers.max_advance_days,
      operating_hours,
      branding,
      updated_at: new Date().toISOString()
    };

    // Production always persists to the database (and fails loudly if it cannot)
    if (SUPABASE_CONFIGURED || !allowLocalFallback) {
      let dbError = null;
      let savedRow = null;

      try {
        const { data, error } = await supabase
          .from('restaurant_settings')
          .upsert([payload], { onConflict: 'restaurant_id' })
          .select()
          .single();

        dbError = error;
        savedRow = data;
      } catch (e) {
        dbError = e;
      }

      // The written row must come back; otherwise the save did not really happen
      if (!dbError && !savedRow) {
        dbError = { code: 'NO_ROW_RETURNED', message: 'Upsert returned no row' };
      }

      if (dbError) {
        console.error(`[AvailabilityService] Settings save failed for ${restaurantId}:`, dbError.code || '', dbError.message || dbError);

        if (isPermissionError(dbError) || dbError.code === 'NO_ROW_RETURNED') {
          throw settingsError('The database rejected saving restaurant settings (server key/permissions).', 'DB_PERMISSION_DENIED', 500);
        }

        // PGRST204 = column missing from the schema (operating_hours / branding not migrated yet)
        if (dbError.code === 'PGRST204' || /column/i.test(dbError.message || '')) {
          throw settingsError('Restaurant settings storage is not migrated yet (missing operating_hours/branding columns).', 'SETTINGS_SCHEMA_MISSING', 500);
        }

        throw settingsError('Restaurant settings could not be saved.', 'SETTINGS_SAVE_FAILED', 500);
      }

      // Sync restaurants branding table (never blank out the restaurant name)
      const restaurantUpdate = {
        primary_color: branding.primary_color,
        updated_at: new Date().toISOString()
      };
      if (branding.restaurant_name) restaurantUpdate.name = branding.restaurant_name;

      const { error: restaurantError } = await supabase
        .from('restaurants')
        .update(restaurantUpdate)
        .eq('id', restaurantId);

      if (restaurantError) {
        console.error(`[AvailabilityService] Restaurant name/color sync failed for ${restaurantId}:`, restaurantError.code || '', restaurantError.message);
        throw settingsError(
          'Settings were saved, but the restaurant name/color could not be updated.',
          isPermissionError(restaurantError) ? 'DB_PERMISSION_DENIED' : 'RESTAURANT_SYNC_FAILED',
          500
        );
      }
    }

    // Only cache once persisted (or when running without Supabase in local dev)
    localSettingsStore[restaurantId] = payload;
    savePersistedSettings(localSettingsStore);

    return payload;
  }

  /**
   * Fetch active shifts for a specific day of week
   */
  async getShiftsForDay(restaurantId, dayOfWeek) {
    const settings = await this.getSettings(restaurantId);
    const dayKey = normalizeDayKey(dayOfWeek);

    if (settings.operating_hours && settings.operating_hours[dayKey]) {
      const dayData = settings.operating_hours[dayKey];
      if (dayData.is_open === false) {
        return [];
      }
      if (Array.isArray(dayData.shifts) && dayData.shifts.length > 0) {
        return dayData.shifts.map((s) => ({
          shift_name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          max_covers: s.max_covers || settings.max_covers_per_slot || 20,
          is_active: true
        }));
      }
    }

    try {
      const { data, error } = await supabase
        .from('restaurant_shifts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('day_of_week', typeof dayOfWeek === 'number' ? dayOfWeek : DAY_NAMES.indexOf(dayKey))
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {}

    return [
      { shift_name: 'Lunch', start_time: '12:00', end_time: '15:00', max_covers: 20, is_active: true },
      { shift_name: 'Dinner', start_time: '18:00', end_time: '22:30', max_covers: 24, is_active: true }
    ];
  }

  /**
   * Main Capacity & Availability Calculator (30-min intervals)
   */
  async getAvailableSlots(restaurantId, dateStr, partySize = 2) {
    if (!restaurantId || !dateStr) {
      throw new Error('restaurant_id and date (YYYY-MM-DD) are required.');
    }

    const requestedPartySize = parseInt(partySize, 10) || 2;
    const settings = await this.getSettings(restaurantId);

    // Calculate day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dateObj = new Date(`${dateStr}T12:00:00`);
    const dayIndex = dateObj.getDay();
    const dayKey = DAY_NAMES[dayIndex];

    // This response is public: expose only guest-facing settings, never the full
    // row (it holds notification addresses and other internal configuration).
    const responseBase = {
      success: true,
      restaurant_id: restaurantId,
      date: dateStr,
      day_of_week: dayKey,
      party_size: requestedPartySize,
      settings: { branding: settings.branding },
      branding: settings.branding,
      booking_policy: publicBookingPolicy(settings)
    };

    // Booking policies (party size, booking window, same-day) in restaurant time
    const violation = evaluateBookingRequest(settings, { date: dateStr, partySize: requestedPartySize });
    if (violation) {
      return {
        ...responseBase,
        is_open: false,
        policy_blocked: true,
        policy_code: violation.code,
        message: violation.message,
        shifts: [],
        slots: []
      };
    }

    const daySchedule = settings.operating_hours ? settings.operating_hours[dayKey] : null;

    // Check if the restaurant is closed on this day of the week
    if (daySchedule && daySchedule.is_open === false) {
      return {
        ...responseBase,
        is_open: false,
        message: 'Closed on this date',
        shifts: [],
        slots: []
      };
    }

    const shifts = await this.getShiftsForDay(restaurantId, dayIndex);

    if (!shifts || shifts.length === 0) {
      return {
        ...responseBase,
        is_open: false,
        message: 'Closed on this date (no active shifts)',
        shifts: [],
        slots: []
      };
    }

    // Fetch existing active bookings for capacity calculations
    let activeReservations = [];
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('date', dateStr);

      // Production: without existing bookings capacity would look free (overbooking risk)
      if (error && !allowLocalFallback) {
        throw new Error(`Availability lookup failed: ${error.message}`);
      }

      if (!error && data) {
        activeReservations = data.filter((r) =>
          ['CONFIRMED', 'SEATED', 'PENDING'].includes((r.status || '').toUpperCase())
        );
      }
    } catch (err) {
      console.warn('[AvailabilityService] Reservations query fallback:', err.message);
      if (!allowLocalFallback) throw err;
    }

    // Merge with disk store reservations (development only)
    if (allowLocalFallback) {
    try {
      const resFilePath = path.join(DATA_DIR, 'reservations.json');
      if (fs.existsSync(resFilePath)) {
        const diskRes = JSON.parse(fs.readFileSync(resFilePath, 'utf8'));
        const tenantRes = diskRes[restaurantId] || [];
        const matchingDateRes = tenantRes.filter(
          (r) =>
            (r.date === dateStr || r.reservation_date === dateStr) &&
            ['CONFIRMED', 'SEATED', 'PENDING'].includes((r.status || '').toUpperCase())
        );

        const resMap = new Map();
        activeReservations.forEach((r) => resMap.set(r.id, r));
        matchingDateRes.forEach((r) => resMap.set(r.id, { ...(resMap.get(r.id) || {}), ...r }));
        activeReservations = Array.from(resMap.values());
      }
    } catch (e) {}
    }

    const interval = 30; // 30-minute steps strictly enforced
    const globalMaxCovers = settings.max_covers_per_slot || 20;
    // 0 is a valid "no minimum notice"
    const minAdvanceNotice = settings.min_advance_notice_mins ?? 60;
    const defaultDuration = policyFromSettings(settings).reservation_duration_minutes;

    // Advance notice is measured in the restaurant's timezone (not the server clock)
    const localNow = nowInTimeZone(resolveTimeZone(settings.timezone));
    const dayOffset = daysBetween(localNow.date, dateStr);

    const allSlots = [];
    const seenTimes = new Set();

    // Generate discrete slots across all active shifts for this day
    for (const shift of shifts) {
      const shiftStartMin = timeToMinutes(shift.start_time);
      const shiftEndMin = timeToMinutes(shift.end_time);
      const shiftMaxCovers = shift.max_covers || globalMaxCovers;

      for (let slotMin = shiftStartMin; slotMin < shiftEndMin; slotMin += interval) {
        const slotTimeStr = minutesToTime(slotMin);
        if (seenTimes.has(slotTimeStr)) continue;
        seenTimes.add(slotTimeStr);

        const slotDisplay = formatDisplayTime(slotTimeStr);

        // Calculate booked covers overlapping this slot
        let bookedCovers = 0;
        for (const res of activeReservations) {
          const resStartMin = timeToMinutes(res.time);
          const duration = res.duration_minutes || defaultDuration;
          const resEndMin = resStartMin + duration;

          // Check if booking overlaps this slot
          if (slotMin >= resStartMin && slotMin < resEndMin) {
            bookedCovers += parseInt(res.guests || 2, 10);
          }
        }

        const remainingCovers = Math.max(0, shiftMaxCovers - bookedCovers);

        // Minimum advance notice across days (e.g. 24h notice also blocks early slots tomorrow)
        const minutesUntilSlot = dayOffset * 1440 + slotMin - localNow.minutes;
        const isPastCutoff = minutesUntilSlot < minAdvanceNotice;

        const isAvailable = remainingCovers >= requestedPartySize && !isPastCutoff;

        allSlots.push({
          time: slotTimeStr,
          display_time: slotDisplay,
          shift_name: shift.shift_name || shift.name,
          available: isAvailable,
          remaining_covers: remainingCovers,
          max_covers: shiftMaxCovers,
          booked_covers: bookedCovers,
          reason: isPastCutoff ? 'Advance notice passed' : (remainingCovers < requestedPartySize ? 'Fully booked' : null)
        });
      }
    }

    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    return {
      ...responseBase,
      is_open: true,
      shifts,
      slots: allSlots
    };
  }

  /**
   * Validate if a specific slot can accommodate a party
   */
  async validateSlotCapacity(restaurantId, dateStr, timeStr, partySize) {
    const availability = await this.getAvailableSlots(restaurantId, dateStr, partySize);
    if (availability.is_open === false) {
      return {
        valid: false,
        remaining_covers: 0,
        reason: 'Restaurant is closed on this date'
      };
    }

    const targetSlot = availability.slots.find((s) => s.time === timeStr || s.time.startsWith(timeStr.slice(0, 5)));

    if (!targetSlot) {
      return {
        valid: false,
        remaining_covers: 0,
        reason: 'Selected time is outside active operating shifts'
      };
    }

    return {
      valid: targetSlot.available,
      remaining_covers: targetSlot.remaining_covers,
      reason: targetSlot.reason
    };
  }
}

module.exports = new AvailabilityService();
