/**
 * Tenant isolation & admin route security tests.
 *
 * Run: npm test
 *
 * Uses tests/helpers/sandbox.js: the real app runs from a temporary copy of src/
 * with an in-memory Supabase stand-in, so the repo's data/*.json files, .env and
 * the real database are never touched.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createSandbox, twoTenantSeed, clone, futureDate, nextWeekday } = require('./helpers/sandbox');

const NEXT_MONDAY = nextWeekday('monday');

const seed = twoTenantSeed();
// rest-B starts without saved opening hours in this suite
seed.restaurant_settings[1].operating_hours = null;

const sandbox = createSandbox({
  db: seed,
  // Simulate the poisoned legacy cache: a shared 'default' entry that used to leak to every tenant
  dataFiles: {
    'restaurant_settings.json': {
      default: {
        restaurant_id: 'rest-LEGACY',
        max_covers_per_slot: 99,
        operating_hours: { monday: { is_open: false, shifts: [] } },
        branding: { restaurant_name: 'Leaked Bistro' }
      }
    }
  }
});

const { db, fakeSchema, call, SANDBOX } = sandbox;
const SETTINGS_COLUMNS = fakeSchema.settingsColumns;

const TOKENS = {
  ownerA: sandbox.tokenFor('user-owner-A'),
  staffA: sandbox.tokenFor('user-staff-A'),
  ownerB: sandbox.tokenFor('user-owner-B')
};

const settingsRow = (restaurantId) => db.restaurant_settings.find((r) => r.restaurant_id === restaurantId);

test.before(() => sandbox.start());
test.after(() => sandbox.stop());

// ---------------------------------------------------------------------
// 1-4: authentication & tenant matching on admin routes
// ---------------------------------------------------------------------
test('1. OWNER can access own restaurant reservations', async () => {
  const res = await call('GET', '/api/admin/rest-A/reservations', { token: TOKENS.ownerA });
  assert.equal(res.status, 200);
  const ids = res.json.data.map((r) => r.id);
  assert.ok(ids.includes('res-A1'));
  assert.ok(!ids.includes('res-B1'));
});

test('2. OWNER requesting another restaurant id gets 403 on every admin route', async () => {
  const routes = [
    ['GET', '/api/admin/rest-B/reservations'],
    ['POST', '/api/admin/rest-B/reservations', { name: 'X', guests: 2, date: '2030-01-07', time: '19:00', phone: '1', email: 'x@x.test' }],
    ['PATCH', '/api/admin/rest-B/reservations/res-B1/status', { status: 'cancelled' }],
    ['PATCH', '/api/admin/rest-B/reservations/res-B1/vip', { is_vip: true }],
    ['GET', '/api/admin/rest-B/customers'],
    ['GET', '/api/admin/rest-B/crm'],
    ['GET', '/api/admin/crm?restaurant_id=rest-B'],
    ['PATCH', '/api/admin/rest-B/customers/cust-B1', { notes: 'hacked' }],
    ['GET', '/api/admin/rest-B/settings'],
    ['PUT', '/api/admin/rest-B/settings', { max_covers_per_slot: 1 }],
    ['PATCH', '/api/admin/rest-B/settings', { max_covers_per_slot: 1 }],
    ['GET', '/api/settings/rest-B'],
    ['PUT', '/api/settings/rest-B', { max_covers_per_slot: 1 }],
    ['GET', '/api/settings/rest-B/staff'],
    ['GET', '/api/reservations?restaurant_id=rest-B']
  ];

  for (const [method, url, body] of routes) {
    const res = await call(method, url, { token: TOKENS.ownerA, body });
    assert.equal(res.status, 403, `${method} ${url} should be 403, got ${res.status}`);
  }

  // Tenant id smuggled in the body must also be rejected
  const smuggled = await call('POST', '/api/admin/rest-A/reservations', {
    token: TOKENS.ownerA,
    body: { restaurant_id: 'rest-B', name: 'X', guests: 2, date: '2030-01-07', time: '19:00', phone: '1', email: 'x@x.test' }
  });
  assert.equal(smuggled.status, 403);

  assert.equal(db.reservations.find((r) => r.id === 'res-B1').status, 'CONFIRMED');
  assert.equal(db.customers.find((c) => c.id === 'cust-B1').notes, 'B private note');
  assert.equal(settingsRow('rest-B').max_covers_per_slot, 15);
});

test('3. Missing token returns 401 on admin routes', async () => {
  for (const [method, url] of [
    ['GET', '/api/admin/rest-A/reservations'],
    ['PATCH', '/api/admin/rest-A/reservations/res-A1/status'],
    ['GET', '/api/admin/rest-A/customers'],
    ['GET', '/api/admin/crm'],
    ['PUT', '/api/admin/rest-A/settings'],
    ['GET', '/api/settings/rest-A'],
    ['GET', '/api/reservations']
  ]) {
    const res = await call(method, url, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${url} should be 401, got ${res.status}`);
  }
});

test('4. Invalid or forged tokens return 401', async () => {
  const jwt = require(path.join(SANDBOX, 'node_modules', 'jsonwebtoken'));
  const forged = jwt.sign({ userId: 'user-owner-A', session_version: 0 }, 'some-other-secret');
  const legacy = `sess_${Buffer.from('a@alpha.test:rest-A:1').toString('base64')}`;

  for (const token of ['garbage', forged, legacy]) {
    const res = await call('GET', '/api/admin/rest-A/reservations', { token });
    assert.equal(res.status, 401);
  }

  const login = await call('POST', '/api/admin/login', { body: { email: 'a@alpha.test', password: 'anything' } });
  assert.equal(login.status, 410, 'legacy demo login must stay retired');
});

// ---------------------------------------------------------------------
// 5: reservation / CRM data isolation (including cross-tenant ids under own path)
// ---------------------------------------------------------------------
test('5. Restaurant B cannot read or modify Restaurant A reservation or guest data', async () => {
  const list = await call('GET', '/api/reservations', { token: TOKENS.ownerB });
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.map((r) => r.id), ['res-B1']);

  const status = await call('PATCH', '/api/admin/rest-B/reservations/res-A1/status', {
    token: TOKENS.ownerB, body: { status: 'cancelled' }
  });
  assert.equal(status.status, 404);
  assert.equal(db.reservations.find((r) => r.id === 'res-A1').status, 'CONFIRMED');

  const vip = await call('PATCH', '/api/admin/rest-B/reservations/res-A1/vip', {
    token: TOKENS.ownerB, body: { is_vip: true }
  });
  assert.equal(vip.status, 404);

  await call('PATCH', '/api/admin/rest-B/customers/cust-A1', {
    token: TOKENS.ownerB, body: { notes: 'overwritten by B', tags: 'VIP' }
  });
  const custA = db.customers.find((c) => c.id === 'cust-A1');
  assert.equal(custA.notes, 'A private note');
  assert.equal(custA.tags, 'Regular');

  const crmB = await call('GET', '/api/admin/rest-B/customers', { token: TOKENS.ownerB });
  assert.equal(crmB.status, 200);
  assert.ok(crmB.json.data.every((c) => c.restaurant_id === 'rest-B'));
  assert.ok(!JSON.stringify(crmB.json.data).includes('A private note'));

  // Own reservation still updatable
  const ownStatus = await call('PATCH', '/api/admin/rest-A/reservations/res-A1/status', {
    token: TOKENS.ownerA, body: { status: 'seated' }
  });
  assert.equal(ownStatus.status, 200);
});

test('5a. Staff directory only lists the own restaurant\'s team', async () => {
  const res = await call('GET', '/api/settings/rest-A/staff', { token: TOKENS.ownerA });
  assert.equal(res.status, 200);
  assert.ok(res.json.data.length > 0);
  assert.ok(res.json.data.every((u) => u.restaurant_id === 'rest-A'));
  assert.ok(res.json.data.every((u) => u.password_hash === undefined));
});

test('5b. Role rules: STAFF works reservations but not CRM or settings writes', async () => {
  assert.equal((await call('GET', '/api/admin/rest-A/reservations', { token: TOKENS.staffA })).status, 200);
  assert.equal((await call('GET', '/api/admin/rest-A/customers', { token: TOKENS.staffA })).status, 403);
  assert.equal((await call('PUT', '/api/admin/rest-A/settings', { token: TOKENS.staffA, body: {} })).status, 403);
  assert.equal((await call('PUT', '/api/settings/rest-A', { token: TOKENS.staffA, body: {} })).status, 403);
});

// ---------------------------------------------------------------------
// 6-7: settings isolation
// ---------------------------------------------------------------------
test('6. Restaurant B cannot read or change Restaurant A settings', async () => {
  const before = clone(settingsRow('rest-A'));

  assert.equal((await call('GET', '/api/settings/rest-A', { token: TOKENS.ownerB })).status, 403);
  assert.equal((await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerB, body: { max_covers_per_slot: 1 } })).status, 403);
  assert.equal((await call('PATCH', '/api/admin/rest-A/settings', { token: TOKENS.ownerB, body: { max_covers_per_slot: 1 } })).status, 403);

  assert.deepEqual(settingsRow('rest-A'), before);
});

test('7. Saving Restaurant A settings never changes Restaurant B', async () => {
  const rowsBefore = db.restaurant_settings.length;
  const bBefore = clone(settingsRow('rest-B'));

  const hoursA = {
    monday: { is_open: false, shifts: [] },
    tuesday: { is_open: true, shifts: [{ name: 'Dinner A', start_time: '18:00', end_time: '22:00', max_covers: 12 }] }
  };

  const save = await call('PUT', '/api/settings/rest-A', {
    token: TOKENS.ownerA,
    body: { name: 'Alpha Kitchen', primary_color: '#ABCDEF', bg_color: '#FEDCBA', max_covers_per_slot: 33, min_advance_notice_mins: 90, max_advance_days: 14, operating_hours: hoursA }
  });
  assert.equal(save.status, 200);

  const rowA = settingsRow('rest-A');
  assert.equal(rowA.max_covers_per_slot, 33);
  assert.equal(rowA.operating_hours.monday.is_open, false);
  assert.equal(rowA.operating_hours.tuesday.shifts[0].name, 'Dinner A');
  assert.equal(rowA.branding.primary_color, '#ABCDEF');
  assert.equal(rowA.id, '11111111-1111-1111-1111-111111111111', 'row id must be kept (no shared id)');

  assert.deepEqual(settingsRow('rest-B'), bBefore, 'Restaurant B row must be untouched');
  assert.equal(db.restaurant_settings.length, rowsBefore, 'no extra/shared settings row');
  assert.ok(!db.restaurant_settings.some((r) => r.id === 'default'));

  const readB = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
  assert.equal(readB.status, 200);
  assert.equal(readB.json.data.max_covers_per_slot, 15);
  assert.notEqual(readB.json.data.operating_hours.monday.is_open, false, 'B must not inherit A\'s closed Monday');
  assert.notEqual(readB.json.data.branding.primary_color, '#ABCDEF');

  // Public availability for B (a Monday) still reflects B's own schedule
  const availB = await call('GET', `/api/availability?restaurant_id=rest-B&date=${NEXT_MONDAY}&party_size=2`);
  assert.equal(availB.status, 200);
  assert.equal(availB.json.is_open, true);

  const availA = await call('GET', `/api/availability?restaurant_id=rest-A&date=${NEXT_MONDAY}&party_size=2`);
  assert.equal(availA.json.is_open, false);
});

test('7b. Legacy shared "default" cache entry is never served to a tenant', async () => {
  // rest-C has no DB row: it must get fresh defaults, not the poisoned 'default' entry
  const availabilityService = require(path.join(SANDBOX, 'src', 'services', 'availabilityService'));
  const settingsC = await availabilityService.getSettings('rest-C');
  assert.notEqual(settingsC.max_covers_per_slot, 99);
  assert.notEqual(settingsC.branding.restaurant_name, 'Leaked Bistro');
  assert.equal(settingsC.restaurant_id, 'rest-C');

  await assert.rejects(() => availabilityService.getSettings(undefined));
  await assert.rejects(() => availabilityService.updateSettings(undefined, {}));
});

test('7c. Save reports failure (does not fake success) when schema is not migrated', async () => {
  const before = clone(settingsRow('rest-A'));
  fakeSchema.settingsColumns = new Set([...SETTINGS_COLUMNS].filter((c) => c !== 'operating_hours' && c !== 'branding'));

  try {
    const res = await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerA, body: { max_covers_per_slot: 44 } });
    assert.equal(res.status, 500);
    assert.deepEqual(settingsRow('rest-A'), before);
  } finally {
    fakeSchema.settingsColumns = SETTINGS_COLUMNS;
  }
});

// ---------------------------------------------------------------------
// 8: public endpoints stay public
// ---------------------------------------------------------------------
test('8. Public widget and availability endpoints work without authentication', async () => {
  const widget = await call('GET', '/api/public/widget/pub_alpha');
  assert.equal(widget.status, 200);
  assert.equal(widget.json.restaurant.id, 'rest-A');
  assert.equal(widget.json.restaurant.public_widget_key, undefined, 'widget key not echoed back');

  assert.equal((await call('GET', '/api/public/widget/pub_unknown')).status, 404);
  assert.equal((await call('GET', `/api/availability?restaurant_id=rest-B&date=${futureDate(8)}`)).status, 200);
  assert.equal((await call('GET', `/api/reservations/availability?restaurant_id=rest-B&date=${futureDate(8)}`)).status, 200);
});
