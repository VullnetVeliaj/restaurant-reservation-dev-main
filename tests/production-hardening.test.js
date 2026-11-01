/**
 * Production hardening tests: JWT configuration, public-endpoint privacy,
 * rate limiting behind the Vercel proxy, no local JSON fallback, error hygiene.
 *
 * Runs the real app in production mode (VERCEL=1, NODE_ENV=production) from a
 * sandboxed copy of src/ with an in-memory Supabase stand-in (see helpers/sandbox.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createSandbox, twoTenantSeed, REPO_ROOT, TEST_JWT_SECRET, futureDate } = require('./helpers/sandbox');

const BOOKING_DATE = futureDate(7);
const LATER_DATE = futureDate(8);

const seed = twoTenantSeed();
seed.customers.push({
  id: 'cust-B-blocked', restaurant_id: 'rest-B', name: 'Repeat No-Show', phone: '+999',
  email: 'blocked@x.test', tags: 'Caution - Past No-Show', notes: 'internal: rude on phone',
  visit_count: 4, no_show_count: 3
});

// A stale local file that must never be read in production
const poisonedReservations = {
  'rest-B': [{ id: 'res-DISK-ONLY', restaurant_id: 'rest-B', name: 'Ghost', guests: 2, date: '2030-01-08', time: '19:00', status: 'CONFIRMED' }]
};

const sandbox = createSandbox({
  env: { VERCEL: '1', NODE_ENV: 'production' },
  db: seed,
  dataFiles: { 'reservations.json': poisonedReservations }
});

const { db, fakeSchema, call, SANDBOX } = sandbox;
const TOKENS = {
  ownerA: sandbox.tokenFor('user-owner-A'),
  ownerB: sandbox.tokenFor('user-owner-B')
};

// Each test uses its own client IP so rate-limit buckets don't interfere
const fromIp = (ip) => ({ 'X-Forwarded-For': ip });

const booking = (overrides = {}) => ({
  restaurant_id: 'rest-B',
  name: 'Public Guest',
  email: 'guest@public.test',
  phone: '+555',
  guests: 2,
  date: BOOKING_DATE,
  time: '19:00',
  ...overrides
});

const INTERNAL_RESERVATION_FIELDS = [
  'guest_is_vip', 'is_vip', 'guest_crm_tags', 'guest_no_show_count', 'guest_visit_count',
  'cancellation_token_hash', 'table_id', 'no_show_count', 'tags', 'notes'
];

test.before(() => sandbox.start());
test.after(() => sandbox.stop());

// ---------------------------------------------------------------------
// 1. JWT configuration
// ---------------------------------------------------------------------
function loadAuthWith(env) {
  // Fresh process, sandbox cwd (no .env), only the variables under test
  return spawnSync(process.execPath, ['-e', "require('./src/utils/auth.js'); console.log('AUTH_LOADED')"], {
    cwd: SANDBOX,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8'
  });
}

test('1a. Production refuses to start without a strong JWT_SECRET', () => {
  const cases = [
    { label: 'missing', env: {} },
    { label: 'empty', env: { JWT_SECRET: '   ' } },
    { label: 'short', env: { JWT_SECRET: 'short-secret' } },
    { label: 'old source-code default', env: { JWT_SECRET: 'restaurant-reservation-jwt-secret-key-2026' } },
    { label: 'low entropy', env: { JWT_SECRET: 'a'.repeat(64) } }
  ];

  for (const { label, env } of cases) {
    for (const prodFlag of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
      const result = loadAuthWith({ ...prodFlag, ...env });
      assert.notEqual(result.status, 0, `${label} secret must fail (${JSON.stringify(prodFlag)})`);
      assert.match(result.stderr, /\[Config\] JWT_SECRET/);
      assert.ok(!result.stdout.includes('AUTH_LOADED'));
      if (env.JWT_SECRET && env.JWT_SECRET.trim()) {
        assert.ok(!result.stderr.includes(env.JWT_SECRET), 'secret value must never be logged');
      }
    }
  }
});

test('1b. Strong secret starts; development without a secret uses a random one', () => {
  const ok = loadAuthWith({ VERCEL: '1', JWT_SECRET: TEST_JWT_SECRET });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.includes('AUTH_LOADED'));
  assert.ok(!ok.stdout.includes(TEST_JWT_SECRET) && !ok.stderr.includes(TEST_JWT_SECRET));

  const dev = loadAuthWith({});
  assert.equal(dev.status, 0, dev.stderr);
  assert.match(dev.stderr, /random development-only secret/);
});

test('1c. No source-code JWT fallback remains (static check)', () => {
  const srcFiles = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) srcFiles.push(full);
  });
  walk(path.join(REPO_ROOT, 'src'));

  for (const file of srcFiles) {
    const code = fs.readFileSync(file, 'utf8');
    assert.ok(!/process\.env\.JWT_SECRET\s*(\|\||\?\?)/.test(code), `${file} must not default JWT_SECRET`);
    assert.ok(!/\.or\(\s*`/.test(code), `${file} must not build PostgREST .or() filters from interpolated values`);
  }

  const authUtils = fs.readFileSync(path.join(REPO_ROOT, 'src/utils/auth.js'), 'utf8');
  assert.ok(!/module\.exports\s*=\s*{[^}]*JWT_SECRET/.test(authUtils), 'JWT_SECRET must not be exported');
});

test('1d. Forged, wrong-secret, old-default and alg:none tokens are rejected', async () => {
  const jwt = require(path.join(SANDBOX, 'node_modules', 'jsonwebtoken'));
  const payload = { userId: 'user-owner-A', session_version: 0 };
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const tokens = [
    jwt.sign(payload, 'some-other-secret-that-is-long-enough-1234567890'),
    jwt.sign(payload, 'restaurant-reservation-jwt-secret-key-2026'),
    `${header}.${body}.`,
    'garbage'
  ];

  for (const token of tokens) {
    const res = await call('GET', '/api/admin/rest-A/reservations', { token });
    assert.equal(res.status, 401);
  }

  const valid = await call('GET', '/api/admin/rest-A/reservations', { token: TOKENS.ownerA });
  assert.equal(valid.status, 200);
});

// ---------------------------------------------------------------------
// 2. Public endpoint privacy
// ---------------------------------------------------------------------
test('2a. guest-check is not public and is tenant-scoped', async () => {
  for (const method of ['GET', 'POST']) {
    const anon = await call(method, '/api/reservations/guest-check?email=blocked@x.test&restaurant_id=rest-B', {
      body: method === 'POST' ? { email: 'blocked@x.test', restaurant_id: 'rest-B' } : undefined,
      headers: fromIp('10.2.0.1')
    });
    assert.equal(anon.status, 401, `${method} guest-check must require login`);
    assert.ok(!JSON.stringify(anon.json).includes('no_show'));
  }

  const crossTenant = await call('GET', '/api/reservations/guest-check?email=blocked@x.test&restaurant_id=rest-B', {
    token: TOKENS.ownerA, headers: fromIp('10.2.0.2')
  });
  assert.equal(crossTenant.status, 403);

  const own = await call('GET', '/api/reservations/guest-check?email=blocked@x.test', {
    token: TOKENS.ownerB, headers: fromIp('10.2.0.3')
  });
  assert.equal(own.status, 200);
  assert.equal(own.json.data.is_blocked, true);
});

test('2b. Public booking works and returns only guest-facing fields', async () => {
  const res = await call('POST', '/api/reservations', { body: booking(), headers: fromIp('10.3.0.1') });
  assert.equal(res.status, 201, JSON.stringify(res.json));

  const data = res.json.data;
  assert.ok(data.id);
  assert.equal(data.restaurant_id, 'rest-B');
  assert.ok(data.cancellation_token, 'guest receives the cancellation token once');
  for (const field of INTERNAL_RESERVATION_FIELDS) {
    assert.equal(data[field], undefined, `booking response must not expose ${field}`);
  }

  const stored = db.reservations.find((r) => r.id === data.id);
  assert.ok(stored, 'booking persisted in the database');
  assert.ok(stored.cancellation_token_hash && stored.cancellation_token_hash !== data.cancellation_token);

  const missingTenant = await call('POST', '/api/reservations', {
    body: booking({ restaurant_id: undefined }), headers: fromIp('10.3.0.1')
  });
  assert.equal(missingTenant.status, 400, 'no implicit default tenant');
});

test('2c. Blocked guest booking does not disclose CRM history', async () => {
  const res = await call('POST', '/api/reservations', {
    body: booking({ email: 'blocked@x.test', phone: '+999', name: 'Someone' }),
    headers: fromIp('10.4.0.1')
  });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'NO_SHOW_STRIKE_LIMIT');
  const text = JSON.stringify(res.json);
  assert.ok(!/no_show_count|no-show|internal: rude/i.test(text), text);
});

test('2d. Cancellation via emailed token works; responses stay minimal', async () => {
  const created = await call('POST', '/api/reservations', {
    body: booking({ email: 'cancel-me@public.test', time: '20:00' }), headers: fromIp('10.5.0.1')
  });
  assert.equal(created.status, 201);
  const token = created.json.data.cancellation_token;

  const cancelled = await call('POST', '/api/reservations/cancel', {
    body: { cancellation_token: token }, headers: fromIp('10.5.0.1')
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.json));
  assert.match(String(cancelled.json.data.status), /cancel/i);
  for (const field of [...INTERNAL_RESERVATION_FIELDS, 'cancellation_token']) {
    assert.equal(cancelled.json.data[field], undefined, `cancel response must not expose ${field}`);
  }

  const invalid = await call('POST', '/api/reservations/cancel', {
    body: { cancellation_token: 'not-a-real-token' }, headers: fromIp('10.5.0.1')
  });
  assert.equal(invalid.status, 404);

  // Lookup by id stays staff-only and tenant-scoped
  const anonLookup = await call('GET', `/api/reservations/${created.json.data.id}`, { headers: fromIp('10.5.0.1') });
  assert.equal(anonLookup.status, 401);
  const crossLookup = await call('GET', `/api/reservations/${created.json.data.id}`, { token: TOKENS.ownerA, headers: fromIp('10.5.0.1') });
  assert.equal(crossLookup.status, 403);
  const ownLookup = await call('GET', `/api/reservations/${created.json.data.id}`, { token: TOKENS.ownerB, headers: fromIp('10.5.0.1') });
  assert.equal(ownLookup.status, 200);
});

test('2e. Public widget lookup and availability still work without login', async () => {
  const widget = await call('GET', '/api/public/widget/pub_beta');
  assert.equal(widget.status, 200);
  assert.equal(widget.json.restaurant.id, 'rest-B');

  for (const url of [
    `/api/availability?restaurant_id=rest-B&date=${LATER_DATE}&party_size=2`,
    `/api/reservations/availability?restaurant_id=rest-B&date=${LATER_DATE}&party_size=2`
  ]) {
    const res = await call('GET', url);
    assert.equal(res.status, 200);
    assert.equal(res.json.is_open, true);
    assert.ok(res.json.slots.length > 0);
  }
});

// ---------------------------------------------------------------------
// 3. Rate limiting behind the Vercel proxy
// ---------------------------------------------------------------------
test('3a. Vercel trusts exactly one proxy hop', () => {
  assert.equal(sandbox.app.get('trust proxy'), 1);
});

async function exhaust(method, url, limit, { ip, body }) {
  for (let i = 0; i < limit; i++) {
    const res = await call(method, url, { body, headers: fromIp(ip) });
    assert.notEqual(res.status, 429, `request ${i + 1}/${limit} to ${url} must not be limited yet`);
  }
  const blocked = await call(method, url, { body, headers: fromIp(ip) });
  assert.equal(blocked.status, 429, `${url} must return 429 after ${limit} requests`);
  assert.equal(blocked.json.success, false);
  assert.ok(blocked.json.error.message);
  assert.ok(blocked.headers.get('ratelimit') || blocked.headers.get('ratelimit-limit') || blocked.headers.get('retry-after'));
  return blocked;
}

test('3b. Public booking is limited per client (10 / 15 min), shared across route aliases', async () => {
  const ip = '203.0.113.10';
  for (let i = 0; i < 9; i++) {
    const res = await call('POST', '/api/reservations', { body: booking({ email: `rl${i}@x.test` }), headers: fromIp(ip) });
    assert.equal(res.status, 201, JSON.stringify(res.json));
  }
  // 10th request via the /reservations alias counts against the same bucket
  assert.equal((await call('POST', '/reservations', { body: booking({ email: 'rl9@x.test' }), headers: fromIp(ip) })).status, 201);
  const limited = await call('POST', '/api/reservations', { body: booking({ email: 'rl10@x.test' }), headers: fromIp(ip) });
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error.code, 'RATE_LIMITED');

  // A different client is unaffected
  const other = await call('POST', '/api/reservations', { body: booking({ email: 'other@x.test' }), headers: fromIp('203.0.113.11') });
  assert.equal(other.status, 201);
});

test('3c. Spoofed left-most X-Forwarded-For entries do not reset the limit', async () => {
  // Behind Vercel the right-most entry is the real client address
  for (let i = 0; i < 10; i++) {
    await call('POST', '/api/reservations/cancel', {
      body: { cancellation_token: 'x' }, headers: fromIp(`198.51.100.${i}, 192.0.2.50`)
    });
  }
  const res = await call('POST', '/api/reservations/cancel', {
    body: { cancellation_token: 'x' }, headers: fromIp('198.51.100.99, 192.0.2.50')
  });
  assert.equal(res.status, 429);
});

test('3d. Auth, voice and cancellation endpoints return 429 after their thresholds', async () => {
  await exhaust('POST', '/api/auth/login', 5, { ip: '192.0.2.1', body: { email: 'nobody@x.test', password: 'wrong-password' } });
  await exhaust('POST', '/api/auth/register', 5, { ip: '192.0.2.2', body: {} });
  await exhaust('POST', '/api/auth/forgot-password', 3, { ip: '192.0.2.3', body: { email: 'nobody@x.test' } });
  await exhaust('POST', '/api/auth/resend-verification', 3, { ip: '192.0.2.4', body: { email: 'nobody@x.test' } });
  await exhaust('POST', '/api/reservations/cancel', 10, { ip: '192.0.2.5', body: { cancellation_token: 'x' } });
  await exhaust('POST', '/api/voice/parse', 20, { ip: '192.0.2.6', body: { transcript: 'Tisch für 2 morgen um 19 Uhr', restaurant_id: 'rest-B' } });
});

test('3e. Voice transcripts are length-capped', async () => {
  const res = await call('POST', '/api/voice/parse', {
    body: { transcript: 'x'.repeat(1001), restaurant_id: 'rest-B' }, headers: fromIp('192.0.2.7')
  });
  assert.equal(res.status, 413);
});

// ---------------------------------------------------------------------
// 4. No silent JSON fallback in production + error hygiene
// ---------------------------------------------------------------------
function assertNoInternalDetails(res) {
  const text = JSON.stringify(res.json);
  assert.ok(!text.includes('internal detail'), `raw DB error leaked: ${text}`);
  assert.equal(res.json?.error?.details, undefined);
  assert.equal(res.json?.error?.stack, undefined);
}

test('4a. Stale local JSON data is never served in production', async () => {
  const res = await call('GET', '/api/admin/rest-B/reservations', { token: TOKENS.ownerB });
  assert.equal(res.status, 200);
  assert.ok(!res.json.data.some((r) => r.id === 'res-DISK-ONLY'), 'data/reservations.json must be ignored');
});

test('4b. Database failures surface as errors instead of local fallbacks', async () => {
  const before = db.reservations.length;

  fakeSchema.faults = [{ table: 'reservations', ops: ['insert'] }];
  try {
    const res = await call('POST', '/api/reservations', { body: booking({ email: 'fail@x.test' }), headers: fromIp('10.9.0.1') });
    assert.equal(res.status, 500, 'a booking that was not stored must not be confirmed');
    assertNoInternalDetails(res);
    assert.equal(db.reservations.length, before);
  } finally {
    fakeSchema.faults = [];
  }

  fakeSchema.faults = [{ table: 'reservations', ops: ['select'] }];
  try {
    const list = await call('GET', '/api/admin/rest-B/reservations', { token: TOKENS.ownerB });
    assert.equal(list.status, 500, 'admin must see an error, not an empty list');
    assertNoInternalDetails(list);

    const availability = await call('GET', `/api/availability?restaurant_id=rest-B&date=${LATER_DATE}`);
    assert.equal(availability.status, 500, 'availability must not assume zero bookings');
    assertNoInternalDetails(availability);
  } finally {
    fakeSchema.faults = [];
  }

  fakeSchema.faults = [{ table: 'restaurant_settings', ops: ['select'] }];
  try {
    const settings = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
    assert.equal(settings.status, 500, 'settings must not fall back to cached/default values');
    assertNoInternalDetails(settings);
  } finally {
    fakeSchema.faults = [];
  }

  fakeSchema.faults = [{ table: 'reservations', ops: ['update'] }];
  try {
    const status = await call('PATCH', '/api/admin/rest-A/reservations/res-A1/status', {
      token: TOKENS.ownerA, body: { status: 'seated' }
    });
    assert.equal(status.status, 500, 'a failed status write must not be reported as success');
    assert.equal(db.reservations.find((r) => r.id === 'res-A1').status, 'CONFIRMED');
  } finally {
    fakeSchema.faults = [];
  }
});

test('4c. Production never writes local JSON files', () => {
  assert.deepEqual(sandbox.dataDirFiles().sort(), ['reservations.json']);
  const onDisk = JSON.parse(fs.readFileSync(path.join(SANDBOX, 'data', 'reservations.json'), 'utf8'));
  assert.deepEqual(onDisk, poisonedReservations, 'seeded file untouched');
});

// ---------------------------------------------------------------------
// 5. Tenant isolation still holds in production mode
// ---------------------------------------------------------------------
test('5. Tenant isolation remains intact', async () => {
  assert.equal((await call('GET', '/api/admin/rest-B/reservations', { token: TOKENS.ownerA })).status, 403);
  assert.equal((await call('PATCH', '/api/admin/rest-A/reservations/res-B1/status', {
    token: TOKENS.ownerA, body: { status: 'cancelled' }
  })).status, 404);
  assert.equal(db.reservations.find((r) => r.id === 'res-B1').status, 'CONFIRMED');

  // VIP toggle updates only the own restaurant's guest (same phone exists in rest-B)
  db.customers.push({ id: 'cust-B-samephone', restaurant_id: 'rest-B', name: 'Twin', phone: '+100', email: 'twin@x.test', tags: 'Regular', visit_count: 1, no_show_count: 0 });
  const vip = await call('PATCH', '/api/admin/rest-A/reservations/res-A1/vip', { token: TOKENS.ownerA, body: { is_vip: true } });
  assert.equal(vip.status, 200);
  assert.equal(db.customers.find((c) => c.id === 'cust-A1').tags, 'VIP');
  assert.equal(db.customers.find((c) => c.id === 'cust-B-samephone').tags, 'Regular', 'other tenant untouched');
});

// ---------------------------------------------------------------------
// 6. Settings & staff persistence contracts (regressions from the deployed bugs)
// ---------------------------------------------------------------------
test('6a. Add staff persists a real, verified account and handles validation cleanly', async () => {
  const email = 'new.staff@beta.test';
  const created = await call('POST', '/api/settings/rest-B/staff', {
    token: TOKENS.ownerB, body: { full_name: 'New Staff', email, role: 'STAFF', password: 'StaffPass123' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.ok(!JSON.stringify(created.json).includes('password'), 'no password/hash in response');

  const row = db.restaurant_users.find((u) => u.email === email);
  assert.ok(row, 'row persisted in restaurant_users');
  assert.match(row.id, /^[0-9a-f-]{36}$/i, 'database-generated UUID, not a fake id');
  assert.equal(row.restaurant_id, 'rest-B', 'tenant from session');
  assert.equal(row.role, 'STAFF');
  assert.equal(row.email_verified, true, 'owner-created staff can sign in');
  assert.match(row.password_hash, /^\$2/, 'bcrypt hash stored');

  const manager = await call('POST', '/api/settings/rest-B/staff', {
    token: TOKENS.ownerB, body: { full_name: 'New Manager', email: 'new.manager@beta.test', role: 'MANAGER', password: 'ManagerPass123' }
  });
  assert.equal(manager.status, 201);
  assert.equal(manager.json.data.role, 'MANAGER');

  const duplicate = await call('POST', '/api/settings/rest-B/staff', {
    token: TOKENS.ownerB, body: { full_name: 'Dup', email: 'NEW.STAFF@beta.test', role: 'STAFF', password: 'StaffPass123' }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.error.code, 'EMAIL_TAKEN');

  for (const [body, code] of [
    [{ full_name: 'X', email: 'not-an-email', role: 'STAFF', password: 'StaffPass123' }, 'INVALID_EMAIL'],
    [{ full_name: 'X', email: 'x1@beta.test', role: 'STAFF', password: 'short' }, 'WEAK_PASSWORD'],
    [{ full_name: 'X', email: 'x2@beta.test', role: 'STAFF' }, 'WEAK_PASSWORD'],
    [{ full_name: 'X', email: 'x3@beta.test', role: 'CHEF', password: 'StaffPass123' }, 'INVALID_ROLE'],
    [{ full_name: '', email: 'x4@beta.test', role: 'STAFF', password: 'StaffPass123' }, 'INVALID_NAME']
  ]) {
    const res = await call('POST', '/api/settings/rest-B/staff', { token: TOKENS.ownerB, body });
    assert.equal(res.status, 400, `${code}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.error.code, code);
  }

  const owner = await call('POST', '/api/settings/rest-B/staff', {
    token: TOKENS.ownerB, body: { full_name: 'X', email: 'x5@beta.test', role: 'OWNER', password: 'StaffPass123' }
  });
  assert.equal(owner.status, 403);

  const cross = await call('POST', '/api/settings/rest-B/staff', {
    token: TOKENS.ownerA, body: { full_name: 'X', email: 'x6@beta.test', role: 'STAFF', password: 'StaffPass123' }
  });
  assert.equal(cross.status, 403);

  const list = await call('GET', '/api/settings/rest-B/staff', { token: TOKENS.ownerB });
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.map((u) => u.role).sort(), ['MANAGER', 'OWNER', 'STAFF']);
  assert.ok(!JSON.stringify(list.json).includes('password_hash'));
});

test('6b. Settings round trip keeps every field, including 0-minute notice', async () => {
  const hours = { monday: { is_open: true, shifts: [{ name: 'Brunch', start_time: '09:00', end_time: '13:30', max_covers: 17 }] }, tuesday: { is_open: false, shifts: [] } };
  const save = await call('PUT', '/api/settings/rest-B', {
    token: TOKENS.ownerB,
    body: { name: 'Beta Bistro', primary_color: '#335577', bg_color: '#EEDDCC', max_covers_per_slot: 44, slot_interval_minutes: 30, min_advance_notice_mins: 0, max_advance_days: 90, operating_hours: hours }
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));

  const reload = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
  const d = reload.json.data;
  assert.equal(d.operating_hours.monday.shifts[0].name, 'Brunch');
  assert.equal(d.operating_hours.tuesday.is_open, false);
  assert.equal(d.max_covers_per_slot, 44);
  assert.equal(d.min_advance_notice_mins, 0);
  assert.equal(d.max_advance_days, 90);
  assert.equal(d.slot_interval_minutes, 30);
  assert.equal(reload.json.branding.bg_color, '#EEDDCC');

  const outOfRange = await call('PUT', '/api/settings/rest-B', {
    token: TOKENS.ownerB, body: { max_covers_per_slot: 0, operating_hours: hours }
  });
  assert.equal(outOfRange.status, 400);
  assert.equal(outOfRange.json.error.code, 'INVALID_SETTINGS');
});

test('6c. Database permission errors (e.g. anon key + RLS) are reported, not hidden', async () => {
  const restaurantBefore = JSON.parse(JSON.stringify(db.restaurants.find((r) => r.id === 'rest-B')));
  const rls = { code: '42501', message: 'new row violates row-level security policy for table "restaurant_settings"' };

  fakeSchema.faults = [{ table: 'restaurant_settings', ops: ['upsert'], ...rls }];
  try {
    const save = await call('PUT', '/api/settings/rest-B', {
      token: TOKENS.ownerB, body: { name: 'Renamed While Failing', primary_color: '#000000', max_covers_per_slot: 30 }
    });
    assert.equal(save.status, 500);
    assert.equal(save.json.error.code, 'DB_PERMISSION_DENIED');
    assert.deepEqual(db.restaurants.find((r) => r.id === 'rest-B'), restaurantBefore, 'no half-saved branding');
  } finally {
    fakeSchema.faults = [];
  }

  fakeSchema.faults = [{ table: 'restaurant_settings', ops: ['select'], ...rls }];
  try {
    const load = await call('GET', '/api/settings/rest-B', { token: TOKENS.ownerB });
    assert.equal(load.status, 500);
    assert.equal(load.json.error.code, 'DB_PERMISSION_DENIED');
  } finally {
    fakeSchema.faults = [];
  }

  fakeSchema.faults = [{ table: 'restaurant_users', ops: ['insert'], ...rls }];
  try {
    const add = await call('POST', '/api/settings/rest-B/staff', {
      token: TOKENS.ownerB, body: { full_name: 'X', email: 'rls@beta.test', role: 'STAFF', password: 'StaffPass123' }
    });
    assert.equal(add.status, 500, 'staff creation must not report success when the insert failed');
    assert.equal(add.json.error.code, 'DB_PERMISSION_DENIED');
    assert.ok(!db.restaurant_users.some((u) => u.email === 'rls@beta.test'));
  } finally {
    fakeSchema.faults = [];
  }
});

test('6d. A hidden/missing settings row is an error, not silent defaults', async () => {
  const index = db.restaurant_settings.findIndex((r) => r.restaurant_id === 'rest-A');
  const [rowA] = db.restaurant_settings.splice(index, 1);
  try {
    const load = await call('GET', '/api/settings/rest-A', { token: TOKENS.ownerA });
    assert.equal(load.status, 404);
    assert.equal(load.json.error.code, 'SETTINGS_NOT_FOUND');

    // Saving recreates the row for this restaurant
    const save = await call('PUT', '/api/settings/rest-A', { token: TOKENS.ownerA, body: { max_covers_per_slot: 25 } });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    assert.equal(db.restaurant_settings.find((r) => r.restaurant_id === 'rest-A').max_covers_per_slot, 25);
  } finally {
    db.restaurant_settings = db.restaurant_settings.filter((r) => r.restaurant_id !== 'rest-A');
    db.restaurant_settings.push(rowA);
  }
});
