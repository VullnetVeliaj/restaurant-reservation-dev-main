/**
 * Booking policies and restaurant-local time.
 *
 * All "today"/"now" decisions use the restaurant's own timezone
 * (restaurant_settings.timezone), not the server clock (UTC on Vercel).
 * Defaults reproduce the behaviour from before policies were configurable.
 */

const DEFAULT_TIMEZONE = 'Europe/Berlin';

const DEFAULT_POLICY = {
  min_party_size: 1,
  max_party_size: 50,
  reservation_duration_minutes: 90,
  auto_confirm: false,
  cancellation_cutoff_hours: 0,
  same_day_booking: true
};

const DEFAULT_NOTIFICATIONS = {
  notify_guest_on_booking: true,
  notify_guest_on_status_change: true,
  notify_guest_on_cancellation: true,
  notify_owner_on_new_reservation: false,
  notify_owner_on_cancellation: false,
  owner_notification_email: null
};

const POLICY_FIELDS = Object.keys(DEFAULT_POLICY);
const NOTIFICATION_FIELDS = Object.keys(DEFAULT_NOTIFICATIONS);

function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (e) {
    return false;
  }
}

function resolveTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/**
 * Current date (YYYY-MM-DD) and minutes since midnight in the given timezone.
 */
function nowInTimeZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10)
  };
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Calendar-day arithmetic on YYYY-MM-DD strings (timezone-free)
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDateStr, toDateStr) {
  return Math.round((Date.parse(`${toDateStr}T00:00:00Z`) - Date.parse(`${fromDateStr}T00:00:00Z`)) / 86400000);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map((p) => parseInt(p, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Minutes from "now" (restaurant time) until the given local date/time.
 */
function minutesUntil(timeZone, dateStr, timeStr, now = new Date()) {
  const local = nowInTimeZone(timeZone, now);
  return daysBetween(local.date, dateStr) * 1440 + timeToMinutes(timeStr) - local.minutes;
}

/**
 * Settings row (or partial) -> effective policy with defaults for missing columns.
 */
function policyFromSettings(settings = {}) {
  const policy = {};
  for (const field of POLICY_FIELDS) {
    policy[field] = settings[field] === undefined || settings[field] === null ? DEFAULT_POLICY[field] : settings[field];
  }
  return policy;
}

function notificationsFromSettings(settings = {}) {
  const prefs = {};
  for (const field of NOTIFICATION_FIELDS) {
    prefs[field] = settings[field] === undefined ? DEFAULT_NOTIFICATIONS[field] : settings[field];
  }
  return prefs;
}

/**
 * Public, guest-facing policy (safe to expose to the booking widget).
 */
function publicBookingPolicy(settings = {}, now = new Date()) {
  const policy = policyFromSettings(settings);
  const timezone = resolveTimeZone(settings.timezone);
  const today = nowInTimeZone(timezone, now).date;
  const maxAdvanceDays = settings.max_advance_days || 30;

  return {
    timezone,
    today,
    first_bookable_date: policy.same_day_booking ? today : addDays(today, 1),
    last_bookable_date: addDays(today, maxAdvanceDays),
    min_party_size: policy.min_party_size,
    max_party_size: policy.max_party_size,
    max_advance_days: maxAdvanceDays,
    min_advance_notice_mins: settings.min_advance_notice_mins ?? 60,
    same_day_booking: policy.same_day_booking,
    reservation_duration_minutes: policy.reservation_duration_minutes
  };
}

/**
 * Date- and party-level policy check for a booking request.
 * Returns null when allowed, otherwise { code, status, message }.
 * (Time-of-day notice and capacity are enforced per slot by the availability engine.)
 */
function evaluateBookingRequest(settings, { date, partySize }, now = new Date()) {
  const policy = publicBookingPolicy(settings, now);
  const guests = parseInt(partySize, 10);

  if (!isDateString(date)) {
    return { code: 'INVALID_DATE', status: 400, message: 'Bitte wählen Sie ein gültiges Datum.' };
  }

  if (!Number.isFinite(guests) || guests < policy.min_party_size) {
    return {
      code: 'PARTY_TOO_SMALL',
      status: 400,
      message: `Online-Reservierungen sind ab ${policy.min_party_size} Personen möglich.`
    };
  }

  if (guests > policy.max_party_size) {
    return {
      code: 'PARTY_TOO_LARGE',
      status: 400,
      message: `Online-Reservierungen sind bis ${policy.max_party_size} Personen möglich. Für größere Gruppen kontaktieren Sie bitte das Restaurant.`
    };
  }

  if (date < policy.today) {
    return { code: 'DATE_IN_PAST', status: 400, message: 'Das gewählte Datum liegt in der Vergangenheit.' };
  }

  if (date === policy.today && !policy.same_day_booking) {
    return {
      code: 'SAME_DAY_NOT_ALLOWED',
      status: 400,
      message: 'Reservierungen für heute sind online nicht möglich. Bitte wählen Sie ein späteres Datum.'
    };
  }

  if (date > policy.last_bookable_date) {
    return {
      code: 'BEYOND_BOOKING_WINDOW',
      status: 400,
      message: `Reservierungen sind höchstens ${policy.max_advance_days} Tage im Voraus möglich.`
    };
  }

  return null;
}

/**
 * Whether a guest may still cancel (cancellation_cutoff_hours before the start).
 */
function canGuestCancel(settings, reservation, now = new Date()) {
  const cutoffHours = policyFromSettings(settings).cancellation_cutoff_hours;
  if (!cutoffHours) return true;

  const date = reservation.date || reservation.reservation_date;
  const time = reservation.time || reservation.reservation_time;
  if (!isDateString(date) || !time) return true;

  return minutesUntil(settings.timezone, date, time, now) >= cutoffHours * 60;
}

module.exports = {
  DEFAULT_TIMEZONE,
  DEFAULT_POLICY,
  DEFAULT_NOTIFICATIONS,
  POLICY_FIELDS,
  NOTIFICATION_FIELDS,
  isValidTimeZone,
  resolveTimeZone,
  nowInTimeZone,
  isDateString,
  addDays,
  daysBetween,
  timeToMinutes,
  minutesUntil,
  policyFromSettings,
  notificationsFromSettings,
  publicBookingPolicy,
  evaluateBookingRequest,
  canGuestCancel
};
