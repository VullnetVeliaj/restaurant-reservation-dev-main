/**
 * Read-only reservation analytics for one restaurant.
 *
 * - Tenant-scoped: every query filters on the authenticated restaurant_id.
 * - No guest PII: only date, time, party size and status are read.
 * - Dates are evaluated in the restaurant's timezone.
 * - Uses the (restaurant_id, date) index; paginates past PostgREST's 1000-row page.
 */
const supabase = require('../config/supabase');
const availabilityService = require('./availabilityService');
const { resolveTimeZone, nowInTimeZone, addDays } = require('../utils/bookingPolicy');

const ALLOWED_PERIODS = [7, 30, 90];
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
// No-show rate is only meaningful once enough past visits were resolved by staff
const MIN_RESOLVED_FOR_NO_SHOW_RATE = 10;

const INACTIVE_STATUSES = ['CANCELLED', 'DECLINED'];
const RESOLVED_STATUSES = ['SEATED', 'COMPLETED', 'NO_SHOW'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function analyticsError(message, code, status = 500) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function weekdayOf(dateStr) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchReservations(restaurantId, startDate, endDate) {
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('reservations')
      .select('date, time, guests, status')
      .eq('restaurant_id', restaurantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[Analytics] Reservation query failed for ${restaurantId}:`, error.code || '', error.message);
      throw analyticsError('Analytics could not be loaded.', 'ANALYTICS_LOAD_FAILED');
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function getRestaurantAnalytics(restaurantId, { days = 30, now = new Date() } = {}) {
  if (!restaurantId) throw analyticsError('restaurant_id is required.', 'INVALID_REQUEST', 400);

  const periodDays = ALLOWED_PERIODS.includes(Number(days)) ? Number(days) : 30;
  const settings = await availabilityService.getSettings(restaurantId);
  const timezone = resolveTimeZone(settings.timezone);
  const today = nowInTimeZone(timezone, now).date;

  // Monday-based calendar week containing "today"
  const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  const periodStart = addDays(today, -(periodDays - 1));

  const rows = (await fetchReservations(
    restaurantId,
    periodStart < weekStart ? periodStart : weekStart,
    weekEnd > today ? weekEnd : today
  )).map((r) => ({
    date: String(r.date).slice(0, 10),
    hour: parseInt(String(r.time || '').slice(0, 2), 10),
    guests: parseInt(r.guests, 10) || 0,
    status: String(r.status || '').toUpperCase()
  }));

  const isActive = (r) => !INACTIVE_STATUSES.includes(r.status);
  const sumGuests = (list) => list.reduce((total, r) => total + r.guests, 0);

  // Today & this week (upcoming bookings included, cancellations excluded)
  const todayActive = rows.filter((r) => r.date === today && isActive(r));
  const weekActive = rows.filter((r) => r.date >= weekStart && r.date <= weekEnd && isActive(r));

  // Reporting period: the last N days up to and including today
  const period = rows.filter((r) => r.date >= periodStart && r.date <= today);
  const periodActive = period.filter(isActive);

  const byStatus = {};
  for (const r of period) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const cancelled = period.filter((r) => INACTIVE_STATUSES.includes(r.status)).length;
  const resolved = period.filter((r) => RESOLVED_STATUSES.includes(r.status));
  const noShows = resolved.filter((r) => r.status === 'NO_SHOW').length;

  const hourCounts = {};
  for (const r of periodActive) {
    if (Number.isFinite(r.hour)) hourCounts[r.hour] = (hourCounts[r.hour] || 0) + 1;
  }
  const hours = Object.keys(hourCounts).map(Number);
  const peakHours = hours.length
    ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => {
      const hour = Math.min(...hours) + i;
      return { hour, reservations: hourCounts[hour] || 0 };
    })
    : [];

  const weekdayCounts = Object.fromEntries(WEEKDAY_ORDER.map((d) => [d, 0]));
  for (const r of periodActive) weekdayCounts[weekdayOf(r.date)] += 1;

  const trend = [];
  for (let date = periodStart; date <= today; date = addDays(date, 1)) {
    const onDay = period.filter((r) => r.date === date);
    trend.push({
      date,
      reservations: onDay.filter(isActive).length,
      cancelled: onDay.filter((r) => !isActive(r)).length
    });
  }

  return {
    timezone,
    today,
    week: { start: weekStart, end: weekEnd },
    period: { start: periodStart, end: today, days: periodDays },
    kpis: {
      reservations_today: todayActive.length,
      guests_today: sumGuests(todayActive),
      reservations_this_week: weekActive.length,
      guests_this_week: sumGuests(weekActive.filter((r) => r.status !== 'NO_SHOW')),
      reservations_in_period: period.length,
      cancellation_rate: period.length ? round(cancelled / period.length, 3) : null,
      average_party_size: periodActive.length ? round(sumGuests(periodActive) / periodActive.length, 1) : null,
      no_show_rate: resolved.length >= MIN_RESOLVED_FOR_NO_SHOW_RATE ? round(noShows / resolved.length, 3) : null,
      no_show_sample_size: resolved.length,
      no_show_min_sample: MIN_RESOLVED_FOR_NO_SHOW_RATE
    },
    by_status: byStatus,
    peak_hours: peakHours,
    weekdays: WEEKDAY_ORDER.map((day) => ({ day, reservations: weekdayCounts[day] })),
    trend,
    generated_at: now.toISOString()
  };
}

module.exports = {
  ALLOWED_PERIODS,
  getRestaurantAnalytics
};
