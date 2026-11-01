/**
 * Restaurant-specific email notifications (Resend via emailService).
 *
 * Every event reads the preferences of the reservation's own restaurant
 * (restaurant_settings.notify_*). Before migration 2026-10-09 the defaults
 * reproduce the previous behaviour: guest emails on, owner emails off.
 *
 * Sending never fails the API request; failures are logged.
 */
const supabase = require('../config/supabase');
const availabilityService = require('./availabilityService');
const {
  sendReservationReceivedNotification,
  sendReservationStatusUpdatedNotification,
  sendManualReservationNotification,
  sendOwnerReservationAlert
} = require('./emailService');
const { notificationsFromSettings, DEFAULT_NOTIFICATIONS } = require('../utils/bookingPolicy');

const GUEST_STATUS_EMAILS = ['CONFIRMED', 'DECLINED', 'CANCELLED'];

async function loadPreferences(restaurantId, settings) {
  if (settings) return notificationsFromSettings(settings);
  try {
    return notificationsFromSettings(await availabilityService.getSettings(restaurantId));
  } catch (err) {
    console.error(`[Notifications] Preferences unavailable for ${restaurantId}, using defaults:`, err.code || '', err.message);
    return { ...DEFAULT_NOTIFICATIONS };
  }
}

/**
 * Owner address: explicit notification email -> restaurant contact email -> active OWNER account.
 * Always scoped to the reservation's restaurant.
 */
async function resolveOwnerRecipient(restaurantId, prefs) {
  let restaurantName = '';
  let contactEmail = null;

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .maybeSingle();

  if (restaurant) {
    restaurantName = restaurant.name || '';
    contactEmail = restaurant.contact_email || null;
  }

  let to = prefs.owner_notification_email || contactEmail;

  if (!to) {
    const { data: owner } = await supabase
      .from('restaurant_users')
      .select('email')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'OWNER')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    to = owner?.email || null;
  }

  return { to, restaurantName };
}

async function settle(label, tasks) {
  const results = await Promise.allSettled(tasks.filter(Boolean));
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(`[Notifications] ${label} failed:`, result.reason?.message || result.reason);
    }
  });
}

/**
 * New reservation (public widget or staff manual booking).
 */
async function onReservationCreated(reservation, { source = 'WEB', settings } = {}) {
  if (!reservation?.restaurant_id) return;
  const prefs = await loadPreferences(reservation.restaurant_id, settings);
  const tasks = [];

  if (prefs.notify_guest_on_booking && (reservation.email || reservation.customer_email)) {
    if (source === 'MANUAL') {
      tasks.push(sendManualReservationNotification(reservation));
    } else if ((reservation.status || '').toUpperCase() === 'CONFIRMED') {
      // Automatic confirmation: tell the guest it is confirmed, not "received"
      tasks.push(sendReservationStatusUpdatedNotification(reservation, 'CONFIRMED'));
    } else {
      tasks.push(sendReservationReceivedNotification(reservation));
    }
  }

  if (source === 'WEB' && prefs.notify_owner_on_new_reservation) {
    tasks.push((async () => {
      const { to, restaurantName } = await resolveOwnerRecipient(reservation.restaurant_id, prefs);
      if (to) await sendOwnerReservationAlert(to, reservation, { type: 'NEW', restaurantName });
    })());
  }

  await settle('Reservation created', tasks);
}

/**
 * Staff changed a reservation status (confirm / decline / cancel).
 */
async function onStatusChanged(reservation, status) {
  if (!reservation?.restaurant_id) return;
  const normalized = (status || '').toUpperCase();
  if (!GUEST_STATUS_EMAILS.includes(normalized)) return;

  const prefs = await loadPreferences(reservation.restaurant_id);
  if (!prefs.notify_guest_on_status_change || !(reservation.email || reservation.customer_email)) return;

  await settle('Status change', [sendReservationStatusUpdatedNotification(reservation, normalized)]);
}

/**
 * Guest cancelled via the emailed cancellation link.
 */
async function onGuestCancelled(reservation, { settings } = {}) {
  if (!reservation?.restaurant_id) return;
  const prefs = await loadPreferences(reservation.restaurant_id, settings);
  const tasks = [];

  if (prefs.notify_guest_on_cancellation && (reservation.email || reservation.customer_email)) {
    tasks.push(sendReservationStatusUpdatedNotification(reservation, 'CANCELLED'));
  }

  if (prefs.notify_owner_on_cancellation) {
    tasks.push((async () => {
      const { to, restaurantName } = await resolveOwnerRecipient(reservation.restaurant_id, prefs);
      if (to) await sendOwnerReservationAlert(to, reservation, { type: 'CANCELLED', restaurantName });
    })());
  }

  await settle('Guest cancellation', tasks);
}

module.exports = {
  onReservationCreated,
  onStatusChanged,
  onGuestCancelled
};
