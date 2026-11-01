/**
 * Embeddable widget tests: the WordPress embed works with only data-widget-key.
 *
 * - Backend: public widget endpoints answer cross-origin requests from customer
 *   sites, the key resolves the restaurant, bookings land in that restaurant,
 *   invalid keys fail closed, admin routes stay restricted to TableAI origins.
 * - Widget: public/booking-widget.js runs in a simulated external page and must
 *   send every API call to the backend origin it was loaded from.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, twoTenantSeed, REPO_ROOT, futureDate } = require('./helpers/sandbox');

const BOOKING_DATE = futureDate(7);
const WORDPRESS = 'https://restaurant-max.example';
const WIDGET_SOURCE = fs.readFileSync(path.join(REPO_ROOT, 'public', 'booking-widget.js'), 'utf8');

const seed = twoTenantSeed();
// "Restaurant Max" with its own key; rest-001 exists to prove nothing falls back to it
seed.restaurants.push(
  { id: 'rest-max', name: 'Restaurant Max', slug: 'max', public_widget_key: 'pub_1581167a1eefc04cd050da782de8958f', primary_color: '#333333' },
  { id: 'rest-001', name: 'Grand Bistro', slug: 'grand-bistro', public_widget_key: 'pub_legacy', primary_color: '#0284c7' }
);
const maxSettings = { ...seed.restaurant_settings[0], id: '33333333-3333-3333-3333-333333333333', restaurant_id: 'rest-max' };
seed.restaurant_settings.push(maxSettings);

const sandbox = createSandbox({ db: seed });
const { db, call } = sandbox;
const MAX_KEY = 'pub_1581167a1eefc04cd050da782de8958f';

test.before(() => sandbox.start());
test.after(() => sandbox.stop());

// ---------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------
test('1. Widget key resolves Restaurant Max from an external origin (CORS allowed)', async () => {
  const res = await call('GET', `/api/public/widget/${MAX_KEY}`, { headers: { Origin: WORDPRESS } });
  assert.equal(res.status, 200);
  assert.equal(res.json.restaurant.id, 'rest-max');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('2. CORS preflight for public booking POST from WordPress succeeds', async () => {
  const res = await fetch(`${sandbox.baseUrl()}/api/reservations`, {
    method: 'OPTIONS',
    headers: { Origin: WORDPRESS, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('3. Availability works from the external origin with only widget_key', async () => {
  const res = await call('GET', `/api/reservations/availability?widget_key=${MAX_KEY}&date=${BOOKING_DATE}&party_size=2`, { headers: { Origin: WORDPRESS } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.ok(Array.isArray(res.json.slots || res.json.available_slots || res.json.data?.slots || []));
});

test('4. Booking with widget_key is stored under Restaurant Max, never rest-001', async () => {
  const before = db.reservations.length;
  const res = await call('POST', '/api/reservations', {
    headers: { Origin: WORDPRESS },
    body: { widget_key: MAX_KEY, name: 'WP Guest', email: 'wp@x.test', phone: '+4917000000', guests: 2, date: BOOKING_DATE, time: '19:00' }
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(db.reservations.length, before + 1);
  const created = db.reservations[db.reservations.length - 1];
  assert.equal(created.restaurant_id, 'rest-max');
});

test('5. A forged restaurant_id is ignored when a widget key is sent', async () => {
  const res = await call('POST', '/api/reservations', {
    body: { widget_key: MAX_KEY, restaurant_id: 'rest-001', name: 'Forged', email: 'f@x.test', phone: '+4917000001', guests: 2, date: BOOKING_DATE, time: '19:30' }
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(db.reservations[db.reservations.length - 1].restaurant_id, 'rest-max');
});

test('6. Invalid widget key fails closed everywhere', async () => {
  const before = db.reservations.length;
  const lookup = await call('GET', '/api/public/widget/pub_does_not_exist');
  assert.equal(lookup.status, 404);

  const avail = await call('GET', `/api/reservations/availability?widget_key=pub_does_not_exist&date=${BOOKING_DATE}`);
  assert.equal(avail.status, 404);

  const booking = await call('POST', '/api/reservations', {
    body: { widget_key: 'pub_does_not_exist', name: 'X', email: 'x@x.test', phone: '+1', guests: 2, date: BOOKING_DATE, time: '19:00' }
  });
  assert.equal(booking.status, 404);
  assert.equal(db.reservations.length, before);
});

test('7. Admin routes do not get the open CORS policy', async () => {
  const res = await fetch(`${sandbox.baseUrl()}/api/admin/rest-max/reservations`, {
    method: 'OPTIONS',
    headers: { Origin: WORDPRESS, 'Access-Control-Request-Method': 'GET' }
  });
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  assert.notEqual(res.headers.get('access-control-allow-origin'), WORDPRESS);
});

// ---------------------------------------------------------------------
// Widget in a simulated external page
// ---------------------------------------------------------------------

// Minimal DOM stand-in: every unknown property/method returns another stub,
// so the widget can render without a real browser.
function stub() {
  const fn = function () { return stub(); };
  const props = {};
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return target[prop];
      if (!(prop in props)) props[prop] = stub();
      return props[prop];
    },
    set(target, prop, value) { props[prop] = value; return true; },
    apply() { return stub(); }
  });
}

function runWidgetOnExternalPage({ widgetKey, lookupResponse }) {
  const fetchCalls = [];
  const container = stub();
  const containerState = { innerHTML: '' };
  Object.defineProperty(containerState, 'dataset', { value: {} });

  const target = new Proxy(container, {
    get(t, prop) {
      if (prop === 'dataset') return {};
      if (prop === 'innerHTML') return containerState.innerHTML;
      if (prop === 'textContent') return '';
      if (prop === 'querySelector') return (sel) => (sel === '*:not(br)' ? null : stub());
      return t[prop];
    },
    set(t, prop, value) {
      if (prop === 'innerHTML') containerState.innerHTML = value;
      else t[prop] = value;
      return true;
    }
  });

  const attrs = { src: 'https://restaurant-reservation-dev.vercel.app/booking-widget.js', 'data-widget-key': widgetKey, 'data-theme': 'light' };
  const script = { src: attrs.src, getAttribute: (name) => (name in attrs ? attrs[name] : null) };

  const document = stub();
  document.currentScript = script;
  document.readyState = 'complete';
  document.getElementById = (id) => (id === 'restaurant-booking-widget' ? target : null);
  document.querySelector = () => null;

  const window = { location: { href: `${WORDPRESS}/reservieren/`, origin: WORDPRESS, search: '' } };

  const fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).includes('/api/public/widget/')) {
      return { ok: lookupResponse.ok, json: async () => lookupResponse.body };
    }
    return { ok: true, json: async () => ({ success: true, slots: [], is_open: true }) };
  };

  const context = vm.createContext({
    window, document, fetch, console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { language: 'de-DE', userAgent: 'test' }, HTMLElement: class {},
    getComputedStyle: () => stub(), requestAnimationFrame: (cb) => setTimeout(cb, 0)
  });
  context.window = Object.assign(context, window);
  vm.runInContext(WIDGET_SOURCE, context);

  return { fetchCalls, containerState };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('8. Widget loaded on WordPress sends every API call to the TableAI backend', async () => {
  const { fetchCalls } = runWidgetOnExternalPage({
    widgetKey: MAX_KEY,
    lookupResponse: { ok: true, body: { success: true, restaurant: { id: 'rest-max', name: 'Restaurant Max', primary_color: '#333333' } } }
  });
  await settle();

  assert.ok(fetchCalls.length >= 1, 'widget made no API calls');
  assert.equal(fetchCalls[0], `https://restaurant-reservation-dev.vercel.app/api/public/widget/${MAX_KEY}`);
  for (const url of fetchCalls) {
    assert.ok(url.startsWith('https://restaurant-reservation-dev.vercel.app/api/'), `call left the backend origin: ${url}`);
    assert.ok(!url.includes('rest-001'), `rest-001 leaked into ${url}`);
  }
  const availability = fetchCalls.find((url) => url.includes('/api/reservations/availability'));
  assert.ok(availability, `availability was never requested: ${fetchCalls.join(', ')}`);
  assert.match(availability, /restaurant_id=rest-max/);
  assert.match(availability, new RegExp(`widget_key=${MAX_KEY}`));
});

test('9. Widget with an invalid key shows the error and does not initialize', async () => {
  const { fetchCalls, containerState } = runWidgetOnExternalPage({
    widgetKey: 'pub_does_not_exist',
    lookupResponse: { ok: false, body: { success: false, error: { message: 'Widget nicht gefunden.' } } }
  });
  await settle();

  assert.equal(fetchCalls.length, 1, `unexpected calls after a failed lookup: ${fetchCalls.join(', ')}`);
  assert.match(containerState.innerHTML, /Das Buchungswidget konnte nicht geladen werden/);
});

test('10. Widget source has no relative API calls and no rest-001 fallback', () => {
  assert.ok(!/fetch\(\s*['"`]\//.test(WIDGET_SOURCE), 'relative fetch() found');
  assert.ok(!WIDGET_SOURCE.includes('rest-001'), 'rest-001 referenced in widget');
  for (const file of ['src/utils/restaurantResolver.js', 'src/routes/publicRoutes.js', 'src/routes/reservationRoutes.js', 'src/routes/voiceRoutes.js']) {
    assert.ok(!fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').includes('rest-001'), `rest-001 in ${file}`);
  }
});
