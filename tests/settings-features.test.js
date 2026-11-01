/**
 * Restaurant profile + logo, booking policies, notification preferences, analytics.
 *
 * Runs the real app in production mode against the in-memory Supabase stand-in
 * (tests/helpers/sandbox.js), with the 2026-10-09 columns present ("migrated").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createSandbox, twoTenantSeed, clone, futureDate, todayInSeedTimezone } = require('./helpers/sandbox');

const MIGRATED_SETTINGS = {
  min_party_size: 1,
  max_party_size: 50,
  reservation_duration_minutes: 90,
  auto_confirm: false,
  cancellation_cutoff_hours: 0,
  same_day_booking: true,
  notify_guest_on_booking: true,
  notify_guest_on_status_change: true,
  notify_guest_on_cancellation: true,
  notify_owner_on_new_reservation: false,
  notify_owner_on_cancellation: false,
  owner_notification_email: null
};
const PROFILE_COLUMNS = {
  description: null, cuisine_type: null, contact_email: null, phone: null, website: null,
  street: null, postal_code: null, city: null, country: null, logo_url: null, cover_image_url: null
};

const seed = twoTenantSeed();
seed.restaurants = seed.restaurants.map((r) => ({ ...PROFILE_COLUMNS, ...r }));
seed.restaurant_settings = seed.restaurant_settings.map((s) => ({ ...s, ...MIGRATED_SETTINGS }));
seed.restaurant_users.push({
  id: 'user-staff-B', restaurant_id: 'rest-B', role: 'STAFF', email: 's@beta.test', full_name: 'Staff B',
  is_active: true, email_verified: true, session_version: 0
});

const sandbox = createSandbox({ env: { VERCEL: '1', NODE_ENV: 'production' }, db: seed });
const { db, fakeSchema, emailLog, call, SANDBOX } = sandbox;

const TOKENS = {
  ownerA: sandbox.tokenFor('user-owner-A'),
  ownerB: sandbox.tokenFor('user-owner-B'),
  staffB: sandbox.tokenFor('user-staff-B')
};

const settingsRow = (id) => db.restaurant_settings.find((r) => r.restaurant_id === id);
const restaurantRow = (id) => db.restaurants.find((r) => r.id === id);

let ipCounter = 0;
const freshIp = () => ({ 'X-Forwarded-For': `198.18.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function saveSettingsB(extra, token = TOKENS.ownerB) {
  return call('PUT', '/api/settings/rest-B', { token, body: { max_covers_per_slot: 15, ...extra } });
}

async function book(body) {
  return call('POST', '/api/reservations', {
    headers: freshIp(),
    body: { restaurant_id: 'rest-B', name: 'Guest', email: 'guest@public.test', phone: '+491', guests: 2, date: futureDate(7), time: '19:00', ...body }
  });
}

test.before(() => sandbox.start());
test.after(() => sandbox.stop());

// ---------------------------------------------------------------------
// Pure policy/time logic (deterministic "now")
// ---------------------------------------------------------------------
test('P1. Restaurant-local time, booking window and cancellation cutoff', () => {
  const policy = require(path.join(SANDBOX, 'src', 'utils', 'bookingPolicy'));
  // 22:30 UTC on 7 Oct = 00:30 on 8 Oct in Berlin (CEST)
  const now = new Date('2026-10-07T22:30:00Z');
  assert.deepEqual(policy.nowInTimeZone('Europe/Berlin', now), { date: '2026-10-08', minutes: 30 });
  assert.equal(policy.nowInTimeZone('America/New_York', now).date, '2026-10-07');

  const settings = { timezone: 'Europe/Berlin', max_advance_days: 10, min_party_size: 2, max_party_size: 8, same_day_booking: false };
  const evaluate = (date, partySize) => policy.evaluateBookingRequest(settings, { date, partySize }, now)?.code || null;

  assert.equal(evaluate('2026-10-08', 4), 'SAME_DAY_NOT_ALLOWED', 'Berlin "today", not the UTC date');
  assert.equal(evaluate('2026-10-07', 4), 'DATE_IN_PAST');
  assert.equal(evaluate('2026-10-09', 4), null);
  assert.equal(evaluate('2026-10-18', 4), null, 'last bookable day');
  assert.equal(evaluate('2026-10-19', 4), 'BEYOND_BOOKING_WINDOW');
  assert.equal(evaluate('2026-10-09', 1), 'PARTY_TOO_SMALL');
  assert.equal(evaluate('2026-10-09', 9), 'PARTY_TOO_LARGE');

  const cutoff = { timezone: 'Europe/Berlin', cancellation_cutoff_hours: 24 };
  assert.equal(policy.canGuestCancel(cutoff, { date: '2026-10-09', time: '00:29' }, now), false, '23h59 before');
  assert.equal(policy.canGuestCancel(cutoff, { date: '2026-10-09', time: '00:30' }, now), true, 'exactly 24h before');
  assert.equal(policy.canGuestCancel({ ...cutoff, cancellation_cutoff_hours: 0 }, { date: '2026-10-08', time: '01:00' }, now), true);

  assert.equal(policy.isValidTimeZone('Europe/Berlin'), true);
  assert.equal(policy.isValidTimeZone('Mars/Base'), false);
});

// ---------------------------------------------------------------------
// Capabilities & backward compatibility
// ---------------------------------------------------------------------
test('C1. Settings report capabilities; unsupported groups are refused, not dropped', async () => {
  const res = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.capabilities, { policies: true, notifications: true, profile: true, logo_upload: false, cover_upload: false });

  // Simulate a restaurant before migration 2026-10-09
  const original = clone(settingsRow('rest-A'));
  const originalRestaurant = clone(restaurantRow('rest-A'));
  Object.keys(MIGRATED_SETTINGS).forEach((k) => delete settingsRow('rest-A')[k]);
  ['description', 'cuisine_type', 'contact_email', 'phone', 'website', 'street', 'postal_code', 'city', 'country'].forEach((k) => delete restaurantRow('rest-A')[k]);
  try {
    const pre = await call('GET', '/api/settings/rest-A', { token: TOKENS.ownerA });
    assert.deepEqual(
      { p: pre.json.capabilities.policies, n: pre.json.capabilities.notifications, pr: pre.json.capabilities.profile },
      { p: false, n: false, pr: false }
    );

    const refusedPolicy = await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerA, body: { max_party_size: 10 } });
    assert.equal(refusedPolicy.status, 409);
    assert.equal(refusedPolicy.json.error.code, 'SETTINGS_SCHEMA_MISSING');

    const refusedProfile = await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerA, body: { profile: { city: 'Berlin' } } });
    assert.equal(refusedProfile.status, 409);

    // Existing settings keep working unchanged before the migration
    const legacySave = await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerA, body: { max_covers_per_slot: 26, timezone: 'Europe/Vienna' } });
    assert.equal(legacySave.status, 200, JSON.stringify(legacySave.json));
    assert.equal(settingsRow('rest-A').max_covers_per_slot, 26);
    assert.equal(settingsRow('rest-A').timezone, 'Europe/Vienna');
    assert.ok(!('max_party_size' in settingsRow('rest-A')), 'no policy column written');
  } finally {
    Object.assign(settingsRow('rest-A'), original);
    db.restaurants[db.restaurants.findIndex((r) => r.id === 'rest-A')] = originalRestaurant;
  }
});

// ---------------------------------------------------------------------
// Restaurant profile & timezone
// ---------------------------------------------------------------------
test('R1. Profile persists (tenant-scoped, validated, OWNER/MANAGER only)', async () => {
  const save = await saveSettingsB({
    timezone: 'Europe/Berlin',
    profile: {
      description: 'Modern bistro', cuisine_type: 'French', contact_email: 'Hello@Beta.Test', phone: '+49 30 123456',
      website: 'beta-bistro.example', street: 'Hauptstr. 1', postal_code: '10115', city: 'Berlin', country: 'Germany'
    }
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));

  const row = restaurantRow('rest-B');
  assert.equal(row.description, 'Modern bistro');
  assert.equal(row.contact_email, 'hello@beta.test', 'normalised');
  assert.equal(row.website, 'https://beta-bistro.example/', 'scheme added');
  assert.equal(row.city, 'Berlin');
  assert.equal(restaurantRow('rest-A').city, null, 'other restaurant untouched');

  const reload = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
  assert.equal(reload.json.restaurant.cuisine_type, 'French');

  const clear = await saveSettingsB({ profile: { phone: '' } });
  assert.equal(clear.status, 200);
  assert.equal(restaurantRow('rest-B').phone, null);

  const beforeCovers = settingsRow('rest-B').max_covers_per_slot;
  const invalid = await call('PUT', '/api/settings/rest-B', {
    token: TOKENS.ownerB, body: { max_covers_per_slot: 33, profile: { contact_email: 'not-an-email' } }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'INVALID_PROFILE');
  assert.equal(invalid.json.error.field, 'contact_email');
  assert.equal(settingsRow('rest-B').max_covers_per_slot, beforeCovers, 'nothing written when validation fails');

  for (const bad of [{ website: 'javascript:alert(1)' }, { description: 'x'.repeat(501) }, { phone: 'call me' }]) {
    const res = await saveSettingsB({ profile: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }

  assert.equal((await saveSettingsB({ profile: { city: 'X' } }, TOKENS.staffB)).status, 403, 'STAFF cannot edit');
  assert.equal((await call('PUT', '/api/settings/rest-B', { token: TOKENS.ownerA, body: { profile: { city: 'X' } } })).status, 403);

  const badZone = await saveSettingsB({ timezone: 'Mars/Base' });
  assert.equal(badZone.status, 400);
  assert.equal(settingsRow('rest-B').timezone, 'Europe/Berlin');
});

// ---------------------------------------------------------------------
// Logo upload
// ---------------------------------------------------------------------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 2)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// Raw binary upload, exactly like the admin UI sends it (fetch with a File body)
async function postLogo(buffer, contentType, { token = TOKENS.ownerB, restaurant = 'rest-B' } = {}) {
  const res = await fetch(`${sandbox.baseUrl()}/api/settings/${restaurant}/logo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: buffer
  });
  let json = null;
  try { json = await res.json(); } catch (e) { }
  return { status: res.status, json };
}

test('L1. Logo upload stores only a storage URL; validates type, size, role and tenant', async () => {
  // Bucket missing (migration not run) -> clear error, nothing stored
  const missing = await postLogo(PNG, 'image/png');
  assert.equal(missing.status, 409);
  assert.equal(missing.json.error.code, 'LOGO_STORAGE_NOT_CONFIGURED');

  fakeSchema.buckets.add('restaurant-logos');

  const first = await postLogo(PNG, 'image/png');
  assert.equal(first.status, 200, JSON.stringify(first.json));
  const firstUrl = first.json.data.logo_url;
  assert.match(firstUrl, /^https:\/\/fake\.supabase\.co\/storage\/v1\/object\/public\/restaurant-logos\/rest-B\/logo-\d+\.png$/);
  assert.equal(restaurantRow('rest-B').logo_url, firstUrl, 'only the URL is stored in the database');
  assert.ok(!String(restaurantRow('rest-B').logo_url).startsWith('data:'));

  const settingsView = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
  assert.equal(settingsView.json.capabilities.logo_upload, true);

  await new Promise((r) => setTimeout(r, 5)); // distinct timestamp for the replacement file
  const replace = await postLogo(JPEG, 'image/jpeg');
  assert.equal(replace.status, 200);
  assert.match(replace.json.data.logo_url, /\.jpg$/);
  const stored = Object.keys(fakeSchema.storage['restaurant-logos']);
  assert.deepEqual(stored.length, 1, 'previous logo file removed');
  assert.ok(stored[0].startsWith('rest-B/'));

  for (const [buffer, type, status] of [
    [SVG, 'image/png', 415],               // declared PNG, real content is SVG
    [JPEG, 'image/png', 415],              // declared type does not match the bytes
    [SVG, 'image/svg+xml', 415],           // SVG not accepted at all
    [Buffer.from('hello'), 'text/plain', 415],
    [Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'image/png', 413]
  ]) {
    const res = await postLogo(buffer, type);
    assert.equal(res.status, status, `${type} -> ${JSON.stringify(res.json)}`);
  }
  assert.match(restaurantRow('rest-B').logo_url, /\.jpg$/, 'rejected uploads change nothing');

  assert.equal((await postLogo(PNG, 'image/png', { token: TOKENS.staffB })).status, 403);
  assert.equal((await postLogo(PNG, 'image/png', { token: TOKENS.ownerA })).status, 403, 'other tenant path');

  const removed = await call('DELETE', '/api/settings/rest-B/logo', { token: TOKENS.ownerB });
  assert.equal(removed.status, 200);
  assert.equal(restaurantRow('rest-B').logo_url, null);
  assert.equal(Object.keys(fakeSchema.storage['restaurant-logos']).length, 0);

  // Arbitrary logo URLs can no longer be injected through the settings endpoint
  await saveSettingsB({ logo_url: 'javascript:alert(1)' });
  assert.equal(restaurantRow('rest-B').logo_url, null);
});

// ---------------------------------------------------------------------
// Cover photo (public homepage card): signed upload + server-side validation
// ---------------------------------------------------------------------
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(200, 3)]);

// Simulates the browser's direct PUT to the signed storage URL
function putObject(objectPath, buffer) {
  fakeSchema.storage['restaurant-images'] = fakeSchema.storage['restaurant-images'] || {};
  fakeSchema.storage['restaurant-images'][objectPath] = { size: buffer.length, body: buffer };
}

async function uploadCover(buffer, contentType, { token = TOKENS.ownerB, restaurant = 'rest-B', size = buffer.length } = {}) {
  const start = await call('POST', `/api/settings/${restaurant}/cover/upload-url`, {
    token, body: { content_type: contentType, size }
  });
  if (start.status !== 200) return start;
  putObject(start.json.data.path, buffer);
  return call('POST', `/api/settings/${restaurant}/cover/confirm`, { token, body: { path: start.json.data.path } });
}

const coverFiles = () => Object.keys(fakeSchema.storage['restaurant-images'] || {});
const publicCover = async (id) => (await call('GET', '/api/restaurants')).json.restaurants.find((r) => r.id === id).cover_image_url;

test('CP1. Cover photo: upload, replace, remove; validated content; role and tenant enforced', async () => {
  // Bucket missing (migration not run) -> clear error
  const missing = await uploadCover(PNG, 'image/png');
  assert.equal(missing.status, 409);
  assert.equal(missing.json.error.code, 'COVER_STORAGE_NOT_CONFIGURED');

  fakeSchema.buckets.add('restaurant-images');
  assert.equal((await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB })).json.capabilities.cover_upload, true);

  // 1-3. Upload each accepted format; URL persists and is public
  for (const [buffer, type, ext] of [[JPEG, 'image/jpeg', 'jpg'], [PNG, 'image/png', 'png'], [WEBP, 'image/webp', 'webp']]) {
    const res = await uploadCover(buffer, type);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const url = res.json.data.cover_image_url;
    assert.match(url, new RegExp(`^https://fake\\.supabase\\.co/storage/v1/object/public/restaurant-images/rest-B/cover-\\d+-[a-f0-9]{8}\\.${ext}$`));
    assert.equal(restaurantRow('rest-B').cover_image_url, url);
    assert.equal(await publicCover('rest-B'), url, 'public homepage API returns the cover URL');
    // 4. Replacing removes the previous file
    assert.deepEqual(coverFiles(), [url.split('/restaurant-images/')[1]]);
  }
  assert.equal(restaurantRow('rest-B').logo_url, null, 'logo is untouched');
  const current = restaurantRow('rest-B').cover_image_url;

  // 8. Invalid type / size rejected; nothing changes
  assert.equal((await call('POST', '/api/settings/rest-B/cover/upload-url', { token: TOKENS.ownerB, body: { content_type: 'image/gif', size: 100 } })).status, 415);
  assert.equal((await call('POST', '/api/settings/rest-B/cover/upload-url', { token: TOKENS.ownerB, body: { content_type: 'image/svg+xml', size: 100 } })).status, 415);
  assert.equal((await call('POST', '/api/settings/rest-B/cover/upload-url', { token: TOKENS.ownerB, body: { content_type: 'image/png', size: 5 * 1024 * 1024 + 1 } })).status, 413);
  for (const [buffer, type, status] of [
    [SVG, 'image/png', 415],                                                   // real content is SVG
    [JPEG, 'image/png', 415],                                                  // bytes do not match the declared type
    [Buffer.from('hello world, not an image'), 'image/webp', 415],
    [Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'image/png', 413]   // lied about size up front
  ]) {
    const res = await uploadCover(buffer, type, { size: 1000 });
    assert.equal(res.status, status, `${type} -> ${JSON.stringify(res.json)}`);
  }
  assert.equal(restaurantRow('rest-B').cover_image_url, current, 'rejected uploads change nothing');
  assert.equal(coverFiles().length, 1, 'rejected files are deleted from storage');

  // 7. Staff cannot upload or remove
  assert.equal((await uploadCover(PNG, 'image/png', { token: TOKENS.staffB })).status, 403);
  assert.equal((await call('POST', '/api/settings/rest-B/cover/confirm', { token: TOKENS.staffB, body: { path: coverFiles()[0] } })).status, 403);
  assert.equal((await call('DELETE', '/api/settings/rest-B/cover', { token: TOKENS.staffB })).status, 403);

  // 6. Restaurant A cannot modify Restaurant B's image
  assert.equal((await uploadCover(PNG, 'image/png', { token: TOKENS.ownerA })).status, 403, 'other tenant URL');
  assert.equal((await call('DELETE', '/api/settings/rest-B/cover', { token: TOKENS.ownerA })).status, 403);
  putObject('rest-B/cover-1-deadbeef.png', PNG);
  const hijack = await call('POST', '/api/settings/rest-A/cover/confirm', { token: TOKENS.ownerA, body: { path: 'rest-B/cover-1-deadbeef.png' } });
  assert.equal(hijack.status, 400, 'a path outside the own folder is refused');
  assert.equal(restaurantRow('rest-A').cover_image_url, null);
  assert.equal(restaurantRow('rest-B').cover_image_url, current);
  delete fakeSchema.storage['restaurant-images']['rest-B/cover-1-deadbeef.png'];

  // Cover URL cannot be injected through the generic settings endpoint
  await saveSettingsB({ cover_image_url: 'https://evil.example/x.png' });
  assert.equal(restaurantRow('rest-B').cover_image_url, current);

  // 5. Remove -> null in DB and API, files deleted
  const removed = await call('DELETE', '/api/settings/rest-B/cover', { token: TOKENS.ownerB });
  assert.equal(removed.status, 200);
  assert.equal(restaurantRow('rest-B').cover_image_url, null);
  assert.equal(await publicCover('rest-B'), null);
  assert.equal(coverFiles().length, 0);
});

// ---------------------------------------------------------------------
// Booking policies: persisted AND enforced by availability + booking + cancel
// ---------------------------------------------------------------------
test('B1. Booking policies persist with validation', async () => {
  for (const bad of [
    { min_party_size: 0 }, { max_party_size: 501 }, { min_party_size: 6, max_party_size: 4 },
    { reservation_duration_minutes: 100 }, { cancellation_cutoff_hours: 200 }, { auto_confirm: 'yes' }
  ]) {
    const res = await saveSettingsB(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.json.error.code, 'INVALID_SETTINGS');
  }

  const save = await saveSettingsB({
    min_party_size: 2, max_party_size: 6, reservation_duration_minutes: 120,
    auto_confirm: true, cancellation_cutoff_hours: 168, same_day_booking: false
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));

  const row = settingsRow('rest-B');
  assert.deepEqual(
    [row.min_party_size, row.max_party_size, row.reservation_duration_minutes, row.auto_confirm, row.cancellation_cutoff_hours, row.same_day_booking],
    [2, 6, 120, true, 168, false]
  );
  assert.equal(settingsRow('rest-A').max_party_size, 50, 'other restaurant untouched');
});

test('B2. Availability enforces policies and exposes only public settings', async () => {
  const avail = (date, party) => call('GET', `/api/reservations/availability?restaurant_id=rest-B&date=${date}&party_size=${party}`);

  const today = await avail(todayInSeedTimezone(), 2);
  assert.equal(today.status, 200);
  assert.equal(today.json.policy_blocked, true);
  assert.equal(today.json.policy_code, 'SAME_DAY_NOT_ALLOWED');
  assert.equal(today.json.booking_policy.first_bookable_date, futureDate(1));

  assert.equal((await avail(futureDate(3), 8)).json.policy_code, 'PARTY_TOO_LARGE');
  assert.equal((await avail(futureDate(3), 1)).json.policy_code, 'PARTY_TOO_SMALL');
  assert.equal((await avail(futureDate(46), 2)).json.policy_code, 'BEYOND_BOOKING_WINDOW', 'max_advance_days (45) enforced');

  const ok = await avail(futureDate(3), 4);
  assert.equal(ok.json.is_open, true);
  assert.ok(ok.json.slots.some((s) => s.available));

  const text = JSON.stringify(ok.json);
  assert.ok(!/owner_notification_email|notify_|max_covers_per_slot|"id":"2222/.test(text), 'public response leaks no internal settings');
  assert.deepEqual(Object.keys(ok.json.settings), ['branding']);
});

test('B3. Bookings are checked against policies; auto-confirm and duration are applied', async () => {
  const tooMany = await book({ guests: 8, date: futureDate(3) });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.json.error.code, 'PARTY_TOO_LARGE');

  assert.equal((await book({ date: todayInSeedTimezone() })).json.error.code, 'SAME_DAY_NOT_ALLOWED');
  assert.equal((await book({ date: futureDate(46) })).json.error.code, 'BEYOND_BOOKING_WINDOW');
  assert.equal((await book({ guests: 1, date: futureDate(3) })).json.error.code, 'PARTY_TOO_SMALL');
  assert.equal((await book({ restaurant_id: 'rest-UNKNOWN', date: futureDate(3) })).status, 404);

  const created = await book({ guests: 4, date: futureDate(3), time: '19:00' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.data.status, 'CONFIRMED', 'auto-confirm policy');

  const stored = db.reservations.find((r) => r.id === created.json.data.id);
  assert.equal(stored.duration_minutes, 120, 'default duration from policy');

  // 120-minute duration keeps the table blocked at 20:30 (19:00 + 120 min)
  const avail = await call('GET', `/api/reservations/availability?restaurant_id=rest-B&date=${futureDate(3)}&party_size=2`);
  const slot = (time) => avail.json.slots.find((s) => s.time === time);
  assert.equal(slot('20:30').booked_covers, 4);
  assert.equal(slot('21:00').booked_covers, 0);
});

test('B4. Guest cancellation respects the cutoff', async () => {
  const soon = await book({ guests: 2, date: futureDate(3), time: '18:00' });
  const later = await book({ guests: 2, date: futureDate(10), time: '18:00' });
  assert.equal(soon.status, 201);
  assert.equal(later.status, 201);

  const blocked = await call('POST', '/api/reservations/cancel', { headers: freshIp(), body: { cancellation_token: soon.json.data.cancellation_token } });
  assert.equal(blocked.status, 409, '3 days ahead is inside the 168h cutoff');
  assert.equal(blocked.json.error.code, 'CANCELLATION_CUTOFF');
  assert.equal(db.reservations.find((r) => r.id === soon.json.data.id).status, 'CONFIRMED');

  const allowed = await call('POST', '/api/reservations/cancel', { headers: freshIp(), body: { cancellation_token: later.json.data.cancellation_token } });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
});

// ---------------------------------------------------------------------
// Notifications: restaurant-specific preferences
// ---------------------------------------------------------------------
test('N1. Notification preferences decide which emails are sent, per restaurant', async () => {
  // Reset policies to manual confirmation, no cutoff
  assert.equal((await saveSettingsB({ auto_confirm: false, cancellation_cutoff_hours: 0, same_day_booking: true, min_party_size: 1, max_party_size: 50 })).status, 200);

  // Defaults: guest email only
  emailLog.length = 0;
  assert.equal((await book({ email: 'g1@public.test' })).status, 201);
  await settle();
  assert.deepEqual(emailLog.map((e) => e.fn), ['sendReservationReceivedNotification']);

  // Owner alerts on, guest booking emails off, explicit recipient
  const prefs = await saveSettingsB({
    notify_guest_on_booking: false,
    notify_owner_on_new_reservation: true,
    notify_owner_on_cancellation: true,
    owner_notification_email: 'Alerts@Beta.Test'
  });
  assert.equal(prefs.status, 200, JSON.stringify(prefs.json));
  assert.equal(settingsRow('rest-B').owner_notification_email, 'alerts@beta.test');

  emailLog.length = 0;
  const created = await book({ email: 'g2@public.test' });
  assert.equal(created.status, 201);
  await settle();
  assert.deepEqual(emailLog.map((e) => [e.fn, e.args[0]]), [['sendOwnerReservationAlert', 'alerts@beta.test']]);

  // Recipient fallback: profile contact email, then the active owner account
  await saveSettingsB({ owner_notification_email: '' });
  emailLog.length = 0;
  await book({ email: 'g3@public.test' });
  await settle();
  assert.equal(emailLog[0].args[0], 'hello@beta.test', 'contact email from profile');

  await saveSettingsB({ profile: { contact_email: '' } });
  emailLog.length = 0;
  await book({ email: 'g4@public.test' });
  await settle();
  assert.equal(emailLog[0].args[0], 'b@beta.test', 'owner account email');

  // Restaurant A keeps its own (default) preferences: no owner alert, never B's address
  emailLog.length = 0;
  const bookingA = await call('POST', '/api/reservations', {
    headers: freshIp(),
    body: { restaurant_id: 'rest-A', name: 'A guest', email: 'ga2@public.test', phone: '+4', guests: 2, date: futureDate(5), time: '19:00' }
  });
  await settle();
  assert.equal(bookingA.status, 201, JSON.stringify(bookingA.json));
  assert.deepEqual(emailLog.map((e) => e.fn), ['sendReservationReceivedNotification']);
  assert.ok(!emailLog.some((e) => JSON.stringify(e.args).includes('beta.test')));

  // Guest cancellation -> owner alert (guest cancellation email still on)
  emailLog.length = 0;
  const cancel = await call('POST', '/api/reservations/cancel', { headers: freshIp(), body: { cancellation_token: created.json.data.cancellation_token } });
  assert.equal(cancel.status, 200);
  await settle();
  assert.deepEqual(emailLog.map((e) => e.fn).sort(), ['sendOwnerReservationAlert', 'sendReservationStatusUpdatedNotification']);
  assert.equal(emailLog.find((e) => e.fn === 'sendOwnerReservationAlert').args[2].type, 'CANCELLED');

  // Staff status change respects the guest status-email preference
  await saveSettingsB({ notify_guest_on_status_change: false });
  emailLog.length = 0;
  const pending = db.reservations.find((r) => r.restaurant_id === 'rest-B' && r.status === 'PENDING');
  const changed = await call('PATCH', `/api/admin/rest-B/reservations/${pending.id}/status`, { token: TOKENS.ownerB, body: { status: 'confirmed' } });
  assert.equal(changed.status, 200);
  await settle();
  assert.equal(emailLog.length, 0);

  const badEmail = await saveSettingsB({ owner_notification_email: 'nope' });
  assert.equal(badEmail.status, 400);
});

test('N2. Owner alert email escapes guest-supplied content', () => {
  const realEmail = require(path.join(require('./helpers/sandbox').REPO_ROOT, 'src', 'services', 'emailService.js'));
  const html = realEmail.generateOwnerReservationAlertEmail(
    { name: '<img src=x onerror=alert(1)>', date: '2030-01-01', time: '19:00', guests: 2, special_requests: '<script>x</script>' },
    { type: 'NEW', restaurantName: 'Beta <b>Bistro</b>' }
  );
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------
// Analytics: real data, tenant-scoped, no PII
// ---------------------------------------------------------------------
test('A1. Analytics are calculated from this restaurant\'s reservations only', async () => {
  // Replace reservations with a known data set
  db.reservations = db.reservations.filter((r) => r.restaurant_id !== 'rest-B');
  const add = (offset, time, guests, status) => db.reservations.push({
    id: require('crypto').randomUUID(), restaurant_id: 'rest-B', name: 'Private Name', email: 'private@guest.test',
    phone: '+49999', guests, date: futureDate(offset), time, status
  });

  add(0, '19:00', 4, 'CONFIRMED');
  add(0, '19:30', 2, 'CANCELLED');
  for (let i = 1; i <= 12; i++) add(-i, '20:00', 2, i <= 9 ? 'COMPLETED' : 'NO_SHOW'); // 9 completed + 3 no-shows
  add(-2, '12:00', 6, 'DECLINED');
  add(-40, '19:00', 2, 'COMPLETED'); // outside the 30-day period
  db.reservations.push({ id: 'a-other', restaurant_id: 'rest-A', name: 'A', guests: 9, date: futureDate(0), time: '19:00', status: 'CONFIRMED' });

  const res = await call('GET', '/api/admin/rest-B/analytics?days=30', { token: TOKENS.ownerB });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const a = res.json.data;

  assert.equal(a.kpis.reservations_today, 1, 'cancellations excluded');
  assert.equal(a.kpis.guests_today, 4);
  assert.equal(a.kpis.reservations_in_period, 15, '2 today + 12 past + 1 declined');
  assert.equal(a.kpis.cancellation_rate, Math.round((2 / 15) * 1000) / 1000);
  assert.equal(a.kpis.no_show_rate, 0.25, '3 of 12 resolved visits');
  assert.equal(a.kpis.no_show_sample_size, 12);
  assert.equal(a.kpis.average_party_size, Math.round(((4 + 12 * 2) / 13) * 10) / 10);
  assert.deepEqual(a.by_status, { CONFIRMED: 1, CANCELLED: 1, COMPLETED: 9, NO_SHOW: 3, DECLINED: 1 });
  assert.equal(a.trend.length, 30);
  assert.equal(a.trend[a.trend.length - 1].date, todayInSeedTimezone());
  assert.equal(a.trend.reduce((n, d) => n + d.reservations, 0), 13);
  assert.equal(a.weekdays.reduce((n, d) => n + d.reservations, 0), 13);
  assert.deepEqual(a.peak_hours.map((h) => h.hour), [19, 20]);

  // Week = Monday..Sunday containing today
  const weekStart = a.week.start;
  const inWeek = (offset) => futureDate(offset) >= weekStart && futureDate(offset) <= a.week.end;
  let expectedWeek = 1; // today's confirmed booking
  for (let i = 1; i <= 12; i++) if (inWeek(-i)) expectedWeek += 1;
  assert.equal(a.kpis.reservations_this_week, expectedWeek);

  const text = JSON.stringify(res.json);
  assert.ok(!/Private Name|private@guest\.test|\+49999/.test(text), 'no guest PII');
  assert.ok(!text.includes('a-other'));

  // Too few resolved visits -> rate withheld
  db.reservations = db.reservations.filter((r) => !(r.restaurant_id === 'rest-B' && r.status === 'NO_SHOW'));
  const sparse = await call('GET', '/api/admin/rest-B/analytics?days=7', { token: TOKENS.ownerB });
  assert.equal(sparse.json.data.kpis.no_show_rate, null);
  assert.equal(sparse.json.data.period.days, 7);
  assert.equal(sparse.json.data.trend.length, 7);

  assert.equal((await call('GET', '/api/admin/rest-B/analytics?days=12345', { token: TOKENS.ownerB })).json.data.period.days, 30);
  assert.equal((await call('GET', '/api/admin/rest-B/analytics', { token: TOKENS.staffB })).status, 403);
  assert.equal((await call('GET', '/api/admin/rest-B/analytics', { token: TOKENS.ownerA })).status, 403);
  assert.equal((await call('GET', '/api/admin/rest-B/analytics')).status, 401);
});

test('A2. Analytics read past the 1000-row page limit', async () => {
  db.reservations = db.reservations.filter((r) => r.restaurant_id !== 'rest-B');
  for (let i = 0; i < 2300; i++) {
    db.reservations.push({ id: `bulk-${i}`, restaurant_id: 'rest-B', guests: 2, date: futureDate(-(i % 30)), time: '19:00', status: 'COMPLETED' });
  }
  const res = await call('GET', '/api/admin/rest-B/analytics?days=30', { token: TOKENS.ownerB });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.kpis.reservations_in_period, 2300);
});
