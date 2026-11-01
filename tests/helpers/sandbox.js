/**
 * Test sandbox: runs the real Express app from a temporary copy of src/ with an
 * in-memory Supabase stand-in and a no-op email service.
 *
 * - The repo's data/*.json files and .env are never read or written.
 * - No network access or real database is used.
 * - Must be called before anything from src/ is required (env is read at load time).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

// Long, high-entropy test secret (passes the production strength check)
const TEST_JWT_SECRET = 'test-only-jwt-secret-7f3a9c1e5b2d8f4a6c0e9b7d3f1a5c8e2b4d6f0a';

const clone = (value) => JSON.parse(JSON.stringify(value));

function createSandbox({ env = {}, dataFiles = {}, db: seed = {} } = {}) {
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'tableai-test-'));
  fs.cpSync(path.join(REPO_ROOT, 'src'), path.join(SANDBOX, 'src'), { recursive: true });
  fs.mkdirSync(path.join(SANDBOX, 'data'));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(SANDBOX, 'node_modules'), 'dir');

  for (const [name, content] of Object.entries(dataFiles)) {
    fs.writeFileSync(path.join(SANDBOX, 'data', name), JSON.stringify(content));
  }

  // Keep dotenv from loading the real .env (Supabase / Resend credentials)
  process.chdir(SANDBOX);
  Object.assign(process.env, {
    JWT_SECRET: TEST_JWT_SECRET,
    SUPABASE_URL: 'http://fake-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key'
  }, env);

  const db = clone(seed);

  const SETTINGS_COLUMNS = new Set([
    'id', 'restaurant_id', 'timezone', 'max_covers_per_slot', 'slot_interval_minutes',
    'min_advance_notice_mins', 'max_advance_days', 'created_at', 'updated_at',
    'operating_hours', 'branding',
    // migration 2026-10-09
    'min_party_size', 'max_party_size', 'reservation_duration_minutes', 'auto_confirm',
    'cancellation_cutoff_hours', 'same_day_booking', 'notify_guest_on_booking',
    'notify_guest_on_status_change', 'notify_guest_on_cancellation',
    'notify_owner_on_new_reservation', 'notify_owner_on_cancellation', 'owner_notification_email'
  ]);

  // fakeSchema.settingsColumns: simulate an unmigrated table
  // faults: [{ table, ops: ['select'|'insert'|'update'|'upsert'|'delete'] }] to simulate DB outages
  const fakeSchema = { settingsColumns: SETTINGS_COLUMNS, faults: [], buckets: new Set(), storage: {} };
  const emailLog = [];

  class FakeQuery {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = 'select';
      this.payload = null;
      this.options = {};
    }

    select(columns) {
      // Honour explicit column lists like PostgREST (ignores '*' and embedded relations)
      if (typeof columns === 'string' && columns.trim() !== '*' && !columns.includes('(')) {
        this.columns = columns.split(',').map((c) => c.trim()).filter(Boolean);
      }
      return this;
    }
    eq(column, value) { this.filters.push((row) => String(row[column]) === String(value)); return this; }
    neq(column, value) { this.filters.push((row) => String(row[column]) !== String(value)); return this; }
    in(column, values) { this.filters.push((row) => values.map(String).includes(String(row[column]))); return this; }
    or() { return this; }
    order(column, { ascending = true } = {}) { this.orderBy = { column, ascending }; return this; }
    limit(n) { this.limitTo = n; return this; }
    range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
    is() { return this; }
    ilike() { return this; }
    gte(column, value) { this.filters.push((row) => String(row[column]) >= String(value)); return this; }
    lte(column, value) { this.filters.push((row) => String(row[column]) <= String(value)); return this; }

    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    update(values) { this.op = 'update'; this.payload = values; return this; }
    upsert(rows, options) { this.op = 'upsert'; this.payload = rows; this.options = options || {}; return this; }
    delete() { this.op = 'delete'; return this; }

    single() { this.mode = 'single'; return this.exec(); }
    maybeSingle() { this.mode = 'maybe'; return this.exec(); }
    then(resolve, reject) { return this.exec().then(resolve, reject); }

    checkColumns(row) {
      if (this.table !== 'restaurant_settings') return null;
      const unknown = Object.keys(row).find((key) => !fakeSchema.settingsColumns.has(key));
      return unknown
        ? { code: 'PGRST204', message: `Could not find the '${unknown}' column of 'restaurant_settings' in the schema cache` }
        : null;
    }

    async exec() {
      const fault = fakeSchema.faults.find((f) => f.table === this.table && (!f.ops || f.ops.includes(this.op)));
      if (fault) {
        return {
          data: null,
          error: {
            code: fault.code || 'XX000',
            message: fault.message || `simulated ${this.table} ${this.op} outage (internal detail)`
          }
        };
      }

      const table = db[this.table] || (db[this.table] = []);
      const matches = () => table.filter((row) => this.filters.every((fn) => fn(row)));
      let rows;

      if (this.op === 'select') {
        rows = matches();
        if (this.orderBy) {
          const { column, ascending } = this.orderBy;
          rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (this.rangeFrom !== undefined) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
        if (this.limitTo !== undefined) rows = rows.slice(0, this.limitTo);
      } else if (this.op === 'insert') {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(clone);
        for (const row of incoming) {
          const err = this.checkColumns(row);
          if (err) return { data: null, error: err };

          // Mirror the live restaurant_users table: UUID primary key, unique lower(email)
          if (this.table === 'restaurant_users') {
            if (row.id === undefined) row.id = require('crypto').randomUUID();
            if (!/^[0-9a-f-]{36}$/i.test(String(row.id))) {
              return { data: null, error: { code: '22P02', message: `invalid input syntax for type uuid: "${row.id}"` } };
            }
            if (table.some((u) => String(u.email).toLowerCase() === String(row.email).toLowerCase())) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "restaurant_users_email_lower_key"' } };
            }
          }
        }
        incoming.forEach((row) => table.push(clone(row)));
        rows = incoming;
      } else if (this.op === 'update') {
        const err = this.checkColumns(this.payload);
        if (err) return { data: null, error: err };
        rows = matches();
        rows.forEach((row) => Object.assign(row, clone(this.payload)));
      } else if (this.op === 'upsert') {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const conflictKey = this.options.onConflict || 'id';
        rows = [];
        for (const row of incoming) {
          const err = this.checkColumns(row);
          if (err) return { data: null, error: err };
          if (this.table === 'restaurant_settings' && row.id !== undefined && !/^[0-9a-f-]{36}$/i.test(String(row.id))) {
            return { data: null, error: { code: '22P02', message: `invalid input syntax for type uuid: "${row.id}"` } };
          }
          const existing = table.find((r) => String(r[conflictKey]) === String(row[conflictKey]));
          if (existing) {
            Object.assign(existing, clone(row));
            rows.push(existing);
          } else {
            table.push(clone(row));
            rows.push(row);
          }
        }
      } else if (this.op === 'delete') {
        rows = matches();
        db[this.table] = table.filter((row) => !rows.includes(row));
      }

      let data = clone(rows);
      if (this.columns) {
        data = data.map((row) => Object.fromEntries(this.columns.filter((c) => c in row).map((c) => [c, row[c]])));
      }
      if (this.mode === 'single') {
        return data.length === 1
          ? { data: data[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      if (this.mode === 'maybe') {
        return { data: data[0] || null, error: null };
      }
      return { data, error: null };
    }
  }

  // Minimal Storage API (buckets live in fakeSchema.buckets, objects in fakeSchema.storage)
  const fakeStorage = {
    async getBucket(id) {
      return fakeSchema.buckets.has(id)
        ? { data: { id, public: true }, error: null }
        : { data: null, error: { message: 'Bucket not found' } };
    },
    from(bucket) {
      const objects = () => (fakeSchema.storage[bucket] = fakeSchema.storage[bucket] || {});
      return {
        async upload(objectPath, body, options = {}) {
          if (!fakeSchema.buckets.has(bucket)) return { data: null, error: { message: 'Bucket not found' } };
          if (objects()[objectPath] && !options.upsert) return { data: null, error: { message: 'The resource already exists' } };
          objects()[objectPath] = { size: body.length, contentType: options.contentType, body: Buffer.from(body) };
          return { data: { path: objectPath }, error: null };
        },
        // Signed upload URL; tests simulate the browser PUT with putObject() below
        async createSignedUploadUrl(objectPath) {
          if (!fakeSchema.buckets.has(bucket)) return { data: null, error: { message: 'Bucket not found' } };
          return { data: { signedUrl: `https://fake.supabase.co/storage/v1/object/upload/sign/${bucket}/${objectPath}?token=t`, token: 't', path: objectPath }, error: null };
        },
        async download(objectPath) {
          const obj = objects()[objectPath];
          if (!obj || !obj.body) return { data: null, error: { message: 'Object not found' } };
          const bytes = obj.body;
          return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }, error: null };
        },
        getPublicUrl(objectPath) {
          return { data: { publicUrl: `https://fake.supabase.co/storage/v1/object/public/${bucket}/${objectPath}` } };
        },
        async list(prefix) {
          const names = Object.keys(objects())
            .filter((p) => p.startsWith(`${prefix}/`))
            .map((p) => ({ name: p.slice(prefix.length + 1) }));
          return { data: names, error: null };
        },
        async remove(paths) {
          paths.forEach((p) => delete objects()[p]);
          return { data: paths, error: null };
        }
      };
    }
  };

  const fakeSupabase = { from: (table) => new FakeQuery(table), storage: fakeStorage };

  const stubModule = (relativePath, exportsValue) => {
    const fullPath = path.join(SANDBOX, relativePath);
    require.cache[require.resolve(fullPath)] = {
      id: fullPath, filename: fullPath, loaded: true, exports: exportsValue
    };
  };

  stubModule('src/config/supabase.js', fakeSupabase);
  // Email stub records every send (function name + recipient/arguments)
  stubModule('src/services/emailService.js', new Proxy({}, {
    get: (target, name) => async (...args) => {
      emailLog.push({ fn: String(name), args });
      return { success: true };
    }
  }));

  const requireFromSandbox = (relativePath) => require(path.join(SANDBOX, relativePath));

  // The real server (trust proxy, response hygiene, routes, error handler)
  const app = requireFromSandbox('src/server.js');
  const { generateToken } = requireFromSandbox('src/utils/auth.js');

  let server;
  let baseUrl;

  async function start() {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  function stop() {
    if (server) server.close();
    process.chdir(REPO_ROOT);
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }

  async function call(method, urlPath, { token, body, headers: extraHeaders = {} } = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch (e) { }
    return { status: res.status, json, headers: res.headers };
  }

  const tokenFor = (userId) => generateToken({ userId, session_version: 0 });

  return {
    SANDBOX,
    db,
    fakeSchema,
    emailLog,
    app,
    requireFromSandbox,
    tokenFor,
    start,
    stop,
    call,
    baseUrl: () => baseUrl,
    dataDirFiles: () => fs.readdirSync(path.join(SANDBOX, 'data'))
  };
}

// Two tenants with owners/staff, one reservation and one guest each
function twoTenantSeed() {
  const openAllWeek = {};
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    openAllWeek[day] = { is_open: true, shifts: [{ name: 'All day', start_time: '12:00', end_time: '22:00', max_covers: 50 }] };
  }

  return {
    restaurants: [
      { id: 'rest-A', name: 'Alpha Kitchen', slug: 'alpha', public_widget_key: 'pub_alpha', primary_color: '#111111' },
      { id: 'rest-B', name: 'Beta Bistro', slug: 'beta', public_widget_key: 'pub_beta', primary_color: '#222222' }
    ],
    restaurant_users: [
      { id: 'user-owner-A', restaurant_id: 'rest-A', role: 'OWNER', email: 'a@alpha.test', full_name: 'Owner A', is_active: true, email_verified: true, session_version: 0 },
      { id: 'user-staff-A', restaurant_id: 'rest-A', role: 'STAFF', email: 's@alpha.test', full_name: 'Staff A', is_active: true, email_verified: true, session_version: 0 },
      { id: 'user-owner-B', restaurant_id: 'rest-B', role: 'OWNER', email: 'b@beta.test', full_name: 'Owner B', is_active: true, email_verified: true, session_version: 0 }
    ],
    reservations: [
      { id: 'res-A1', restaurant_id: 'rest-A', name: 'Guest A', email: 'ga@x.test', phone: '+100', guests: 2, date: '2030-01-07', time: '19:00', status: 'CONFIRMED' },
      { id: 'res-B1', restaurant_id: 'rest-B', name: 'Guest B', email: 'gb@x.test', phone: '+200', guests: 4, date: '2030-01-07', time: '20:00', status: 'CONFIRMED' }
    ],
    customers: [
      { id: 'cust-A1', restaurant_id: 'rest-A', name: 'Guest A', phone: '+100', email: 'ga@x.test', tags: 'Regular', notes: 'A private note', visit_count: 1, no_show_count: 0 },
      { id: 'cust-B1', restaurant_id: 'rest-B', name: 'Guest B', phone: '+200', email: 'gb@x.test', tags: 'Regular', notes: 'B private note', visit_count: 1, no_show_count: 0 }
    ],
    restaurant_settings: [
      { id: '11111111-1111-1111-1111-111111111111', restaurant_id: 'rest-A', timezone: 'Europe/Berlin', max_covers_per_slot: 20, slot_interval_minutes: 30, min_advance_notice_mins: 60, max_advance_days: 30, operating_hours: null, branding: null },
      { id: '22222222-2222-2222-2222-222222222222', restaurant_id: 'rest-B', timezone: 'Europe/Berlin', max_covers_per_slot: 15, slot_interval_minutes: 30, min_advance_notice_mins: 60, max_advance_days: 45, operating_hours: openAllWeek, branding: null }
    ],
    restaurant_shifts: []
  };
}

// Dates relative to "today" in the seed restaurants' timezone (booking windows are enforced)
const { nowInTimeZone, addDays } = require(path.join(REPO_ROOT, 'src', 'utils', 'bookingPolicy'));
const SEED_TIMEZONE = 'Europe/Berlin';

function todayInSeedTimezone() {
  return nowInTimeZone(SEED_TIMEZONE).date;
}

function futureDate(days) {
  return addDays(todayInSeedTimezone(), days);
}

function nextWeekday(dayName, minDaysAhead = 1) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let offset = minDaysAhead; offset < minDaysAhead + 7; offset++) {
    const date = futureDate(offset);
    if (names[new Date(`${date}T00:00:00Z`).getUTCDay()] === dayName) return date;
  }
  throw new Error(`no ${dayName} found`);
}

module.exports = {
  todayInSeedTimezone,
  futureDate,
  nextWeekday,
  REPO_ROOT,
  TEST_JWT_SECRET,
  clone,
  createSandbox,
  twoTenantSeed
};
