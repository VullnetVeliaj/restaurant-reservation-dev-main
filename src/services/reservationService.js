const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const crypto = require('crypto');
const { allowLocalFallback } = require('../config/runtime');

const DATA_DIR = path.join(__dirname, '../../data');
const CRM_FILE = path.join(DATA_DIR, 'crm.json');
const RES_FILE = path.join(DATA_DIR, 'reservations.json');

// Local JSON/demo stores are development-only; in production they stay empty and are never written
function loadPersisted(filePath, fallback) {
  if (!allowLocalFallback) return {};
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) { }
  return fallback;
}

function savePersisted(filePath, data) {
  if (!allowLocalFallback) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { }
}

const normalizeReservation = (record) => {
  if (!record) return record;
  return {
    ...record,
    customer_name: record.name || record.customer_name,
    customer_email: record.email || record.customer_email,
    customer_phone: record.phone || record.customer_phone,
    party_size: record.guests || record.party_size,
    reservation_date: record.date || record.reservation_date,
    reservation_time: record.time || record.reservation_time,
    duration_minutes: record.duration_minutes || 90
  };
};

// In-memory CRM fallback store with disk hydration
const DEFAULT_CRM = {
  'rest-001': [
    {
      id: 'cust-101',
      restaurant_id: 'rest-001',
      name: 'Sarah Connor',
      email: 'sarah@skynet.com',
      phone: '+1 (555) 234-5678',
      visit_count: 4,
      no_show_count: 0,
      tags: 'VIP, High Spender',
      notes: 'Prefers quiet booth 4, sparkling water with lime.',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'cust-102',
      restaurant_id: 'rest-001',
      name: 'Marcus Aurelius',
      email: 'marcus@rome.org',
      phone: '+1 (555) 876-5432',
      visit_count: 2,
      no_show_count: 0,
      tags: 'Regular',
      notes: 'Always orders house red wine.',
      created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ]
};

const localCustomerCRM = loadPersisted(CRM_FILE, DEFAULT_CRM);

// In-memory Reservations fallback store with disk hydration
const DEFAULT_RESERVATIONS = {
  'rest-001': [
    {
      id: 'd4b2e8a1-6387-410a-8bf8-d3f3f50819a1',
      restaurant_id: 'rest-001',
      name: 'Sarah Connor',
      email: 'sarah@skynet.com',
      phone: '+1 (555) 234-5678',
      guests: 4,
      date: new Date().toISOString().split('T')[0],
      time: '19:30',
      duration_minutes: 90,
      special_requests: 'Booth preferred, celebrating a birthday',
      status: 'PENDING',
      source: 'WEB',
      created_at: new Date().toISOString()
    },
    {
      id: 'e8f1c3a2-7498-421b-9ca9-e4a4a61920b2',
      restaurant_id: 'rest-001',
      name: 'Marcus Aurelius',
      email: 'marcus@rome.org',
      phone: '+1 (555) 876-5432',
      guests: 2,
      date: new Date().toISOString().split('T')[0],
      time: '20:00',
      duration_minutes: 90,
      special_requests: 'Quiet corner table',
      status: 'CONFIRMED',
      source: 'WEB',
      created_at: new Date().toISOString()
    }
  ]
};

const localReservationsStore = loadPersisted(RES_FILE, DEFAULT_RESERVATIONS);

class ReservationService {
  /**
   * Guest CRM: Upsert customer profile upon reservation creation
   */
  async upsertCustomer(restaurantId, customerData) {
    if (!restaurantId || !customerData.name) return null;

    const email = (customerData.email || '').trim().toLowerCase() || null;
    const phone = (customerData.phone || '').trim() || null;
    const name = customerData.name.trim();

    try {
      let existing = null;
      if (email) {
        const { data } = await supabase
          .from('customers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('email', email)
          .single();
        existing = data;
      }

      if (!existing && phone) {
        const { data } = await supabase
          .from('customers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('phone', phone)
          .single();
        existing = data;
      }

      if (existing) {
        const { data: updated } = await supabase
          .from('customers')
          .update({
            name: name || existing.name,
            visit_count: (existing.visit_count || 1) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        return updated || existing;
      } else {
        const newCustomer = {
          restaurant_id: restaurantId,
          name,
          email,
          phone,
          visit_count: 1,
          no_show_count: 0,
          tags: 'New Guest',
          notes: customerData.special_requests || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: inserted } = await supabase
          .from('customers')
          .insert([newCustomer])
          .select()
          .single();

        return inserted || newCustomer;
      }
    } catch (err) {
      console.warn('[CRM Upsert Warning]:', err.message);
    }

    // In-memory fallback (development only)
    if (!allowLocalFallback) return null;

    if (!localCustomerCRM[restaurantId]) localCustomerCRM[restaurantId] = [];
    let match = localCustomerCRM[restaurantId].find((c) => (email && c.email === email) || (phone && c.phone === phone));
    if (match) {
      match.visit_count += 1;
      match.updated_at = new Date().toISOString();
      return match;
    } else {
      const created = {
        id: `cust-${Date.now()}`,
        restaurant_id: restaurantId,
        name,
        email,
        phone,
        visit_count: 1,
        no_show_count: 0,
        tags: 'New Guest',
        notes: customerData.special_requests || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      localCustomerCRM[restaurantId].unshift(created);
      savePersisted(CRM_FILE, localCustomerCRM);
      return created;
    }
  }

  /**
   * Guest CRM: Increment No-Show count for a guest by phone or email
   */
  async incrementNoShow(restaurantId, { phone, email, name }) {
    const cleanPhone = (phone || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    // Local CRM mirror is development-only; in production the database below is the only store
    if (allowLocalFallback) {
      if (!localCustomerCRM[restaurantId]) localCustomerCRM[restaurantId] = [];
      let match = localCustomerCRM[restaurantId].find(
        (c) => (cleanPhone && c.phone === cleanPhone) || (cleanEmail && c.email === cleanEmail)
      );

      if (match) {
        match.no_show_count = (match.no_show_count || 0) + 1;
        const tagsArr = (match.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        if (!tagsArr.some((t) => t.toLowerCase().includes('no-show'))) {
          tagsArr.unshift('Caution - Past No-Show');
        }
        match.tags = tagsArr.join(', ');
        match.updated_at = new Date().toISOString();
      } else {
        localCustomerCRM[restaurantId].push({
          id: `cust-${Date.now()}`,
          restaurant_id: restaurantId,
          name: name || 'Guest',
          phone: cleanPhone || null,
          email: cleanEmail || null,
          visit_count: 0,
          no_show_count: 1,
          total_covers: 0,
          tags: 'Caution - Past No-Show',
          notes: 'Flagged as No-Show on reservation',
          is_vip: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      savePersisted(CRM_FILE, localCustomerCRM);
    }

    try {
      let query = supabase.from('customers').select('*').eq('restaurant_id', restaurantId);
      if (cleanPhone) query = query.eq('phone', cleanPhone);
      else if (cleanEmail) query = query.eq('email', cleanEmail);

      const { data: existing } = await query.single();

      if (existing) {
        const newNoShow = (existing.no_show_count || 0) + 1;
        const tagsArr = (existing.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        if (!tagsArr.some((t) => t.toLowerCase().includes('no-show'))) {
          tagsArr.unshift('Caution - Past No-Show');
        }
        await supabase
          .from('customers')
          .update({
            no_show_count: newNoShow,
            tags: tagsArr.join(', '),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('customers').insert([
          {
            restaurant_id: restaurantId,
            name: name || 'Guest',
            phone: cleanPhone || null,
            email: cleanEmail || null,
            visit_count: 0,
            no_show_count: 1,
            tags: 'Caution - Past No-Show',
            notes: 'Flagged as No-Show on reservation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
    } catch (e) {
      console.warn('[CRM Increment No-Show DB Warning]:', e.message);
    }
  }

  /**
   * Guest CRM: Fetch aggregated customer directory for tenant
   * Merges records from customers table and reservations history
   */
  async getCustomersByRestaurant(restaurantId, searchQuery = '') {
    const customerMap = new Map();

    // 1. Fetch raw reservations to aggregate history
    try {
      const reservations = await this.getRawReservations(restaurantId);
      for (const res of reservations || []) {
        if (!res) continue;
        const phone = (res?.phone || res?.customer_phone || '').trim();
        const email = (res?.email || res?.customer_email || '').trim().toLowerCase();
        const name = (res?.name || res?.customer_name || 'Guest').trim();
        const guests = parseInt(res?.guests || res?.party_size || 1, 10) || 1;
        const status = (res?.status || '').toUpperCase();
        const date = res?.date || res?.reservation_date || '';

        const key = phone || email || name;
        if (!key || key === 'Guest') continue;

        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: `crm-${key.replace(/[^a-zA-Z0-9]/g, '')}`,
            restaurant_id: restaurantId,
            name: name,
            phone: phone || null,
            email: email || null,
            visit_count: 0,
            no_show_count: 0,
            total_covers: 0,
            last_visit_date: date,
            tags: 'Regular',
            notes: res.special_requests || '',
            is_vip: false,
            created_at: date || new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        const entry = customerMap.get(key);
        if (name && entry.name === 'Guest') entry.name = name;
        if (phone && !entry.phone) entry.phone = phone;
        if (email && !entry.email) entry.email = email;

        if (status === 'COMPLETED' || status === 'SEATED') {
          entry.visit_count += 1;
          entry.total_covers += guests;
        } else if (status === 'CONFIRMED' || status === 'PENDING') {
          entry.total_covers += guests;
        } else if (status === 'NO_SHOW') {
          entry.no_show_count += 1;
        }

        if (date && (!entry.last_visit_date || date > entry.last_visit_date)) {
          entry.last_visit_date = date;
        }

        if (res.special_requests && !entry.notes.includes(res.special_requests)) {
          entry.notes = entry.notes ? `${entry.notes}; ${res.special_requests}` : res.special_requests;
        }
      }
    } catch (e) {
      console.warn('[CRM Reservation Aggregation Warning]:', e.message);
      // Production must not silently compute CRM (incl. the 3-strike block) from partial data
      if (!allowLocalFallback) throw e;
    }

    // 2. Fetch custom overrides from `customers` table
    try {
      const { data: dbCustomers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('restaurant_id', restaurantId);

      if (error && !allowLocalFallback) {
        throw new Error(`Customer lookup failed: ${error.message}`);
      }

      if (!error && dbCustomers) {
        for (const dbC of dbCustomers) {
          const key = (dbC.phone || dbC.email || dbC.name || '').trim();
          if (customerMap.has(key)) {
            const entry = customerMap.get(key);
            entry.id = dbC.id;
            if (dbC.name) entry.name = dbC.name;
            if (dbC.tags) entry.tags = dbC.tags;
            if (dbC.notes) entry.notes = dbC.notes;
            if (dbC.no_show_count !== undefined && dbC.no_show_count !== null) {
              entry.no_show_count = Math.max(entry.no_show_count, dbC.no_show_count);
            }
            if (dbC.visit_count !== undefined && dbC.visit_count !== null) {
              entry.visit_count = Math.max(entry.visit_count, dbC.visit_count);
            }
          } else if (key) {
            customerMap.set(key, {
              id: dbC.id,
              restaurant_id: restaurantId,
              name: dbC.name,
              phone: dbC.phone,
              email: dbC.email,
              visit_count: dbC.visit_count || 1,
              no_show_count: dbC.no_show_count || 0,
              total_covers: (dbC.visit_count || 1) * 2,
              last_visit_date: dbC.updated_at?.split('T')[0] || null,
              tags: dbC.tags || 'Regular',
              notes: dbC.notes || '',
              is_vip: (dbC.tags || '').toLowerCase().includes('vip')
            });
          }
        }
      }
    } catch (e) {
      if (!allowLocalFallback) throw e;
    }

    // 3. In-memory local overrides & disk sync
    const currentCRM = loadPersisted(CRM_FILE, localCustomerCRM);
    const localList = currentCRM[restaurantId] || [];
    for (const loc of localList) {
      const key = (loc.phone || loc.email || loc.name || '').trim();
      if (!key) continue;
      if (customerMap.has(key)) {
        const entry = customerMap.get(key);
        if (loc.tags !== undefined) entry.tags = loc.tags;
        if (loc.notes !== undefined) entry.notes = loc.notes;
        if (loc.no_show_count !== undefined) entry.no_show_count = Math.max(entry.no_show_count || 0, loc.no_show_count);
        if (loc.visit_count !== undefined) entry.visit_count = Math.max(entry.visit_count || 0, loc.visit_count);
        if (loc.is_vip !== undefined) entry.is_vip = loc.is_vip;
      } else {
        customerMap.set(key, {
          id: loc.id || `crm-${key.replace(/[^a-zA-Z0-9]/g, '')}`,
          restaurant_id: restaurantId,
          name: loc.name || 'Guest',
          phone: loc.phone || null,
          email: loc.email || null,
          visit_count: loc.visit_count || 0,
          no_show_count: loc.no_show_count || 0,
          total_covers: loc.total_covers || 0,
          last_visit_date: loc.updated_at?.split('T')[0] || null,
          tags: loc.tags || 'Regular',
          notes: loc.notes || '',
          is_vip: Boolean(loc.is_vip || (loc.tags || '').toLowerCase().includes('vip')),
          created_at: loc.created_at || new Date().toISOString(),
          updated_at: loc.updated_at || new Date().toISOString()
        });
      }
    }

    // Auto-compute tags and VIP status
    let customerList = Array.from(customerMap.values()).map((c) => {
      const tagsArr = (c.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
      if (c.no_show_count > 0 && !tagsArr.some((t) => t.toLowerCase().includes('no-show'))) {
        tagsArr.unshift('Caution - Past No-Show');
      }
      if (c.visit_count >= 3 && !tagsArr.some((t) => t.toLowerCase().includes('regular') || t.toLowerCase().includes('vip'))) {
        tagsArr.push('VIP Regular');
      }
      c.tags = tagsArr.join(', ') || 'Guest';
      c.is_vip = c.tags.toLowerCase().includes('vip');
      return c;
    });

    customerList.sort((a, b) => (b.visit_count - a.visit_count) || (b.total_covers - a.total_covers));

    // Filter by search query (Name or Phone or Email or Tags)
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      customerList = customerList.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.tags && c.tags.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q))
      );
    }

    return customerList;
  }

  /**
   * Guest CRM: Update tags, VIP status, and notes
   */
  async updateCustomer(restaurantId, customerId, { tags, notes, is_vip, phone, email, name }) {
    if (!restaurantId) {
      throw new Error('restaurant_id is required to update a guest profile.');
    }

    let resolvedTags = tags;
    if (is_vip !== undefined) {
      const currentTags = (tags || 'Regular').split(',').map((t) => t.trim()).filter(Boolean);
      const filtered = currentTags.filter((t) => !t.toLowerCase().includes('vip'));
      if (is_vip) filtered.unshift('VIP');
      resolvedTags = filtered.join(', ') || 'Regular';
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .update({
          tags: resolvedTags,
          notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', customerId)
        .eq('restaurant_id', restaurantId)
        .select()
        .single();

      if (!error && data) return data;

      if (error && !allowLocalFallback) {
        // No matching row for this restaurant (or a non-UUID aggregated id): not found
        if (error.code === 'PGRST116' || error.code === '22P02') return null;
        throw new Error(`Guest profile update failed: ${error.message}`);
      }
    } catch (err) {
      if (!allowLocalFallback) throw err;
    }

    // Production never fabricates a successful update
    if (!allowLocalFallback) return null;

    // Local fallback (development only): only search this restaurant's guests
    {
      const tenantGuests = localCustomerCRM[restaurantId] || [];
      const found = tenantGuests.find(
        (c) => c.id === customerId || (phone && c.phone === phone) || (email && c.email === email)
      );
      if (found) {
        if (resolvedTags !== undefined) found.tags = resolvedTags;
        if (notes !== undefined) found.notes = notes;
        found.is_vip = (resolvedTags || '').toLowerCase().includes('vip');
        found.updated_at = new Date().toISOString();
        savePersisted(CRM_FILE, localCustomerCRM);
        return found;
      }
    }

    const manualUpdated = {
      id: customerId,
      name: name || 'Guest',
      phone,
      email,
      tags: resolvedTags || (is_vip ? 'VIP' : 'Regular'),
      notes: notes || '',
      is_vip: Boolean(is_vip),
      updated_at: new Date().toISOString()
    };

    return manualUpdated;
  }

  /**
   * Raw reservation fetch helper for internal aggregation
   */
  async getRawReservations(restaurantId) {
    if (!restaurantId) throw new Error('restaurant_id is required.');
    let list = [];
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_id', restaurantId);

      if (error && !allowLocalFallback) {
        throw new Error(`Reservation lookup failed: ${error.message}`);
      }

      if (!error && data && data.length > 0) {
        list = data.map(normalizeReservation);
      }
    } catch (err) {
      if (!allowLocalFallback) throw err;
    }

    // Merge with local/disk store overrides (empty in production)
    const persistedRes = loadPersisted(RES_FILE, DEFAULT_RESERVATIONS);
    const localList = (persistedRes[restaurantId] || localReservationsStore[restaurantId] || []).map(normalizeReservation);
    const idMap = new Map();
    list.forEach((r) => idMap.set(r.id, r));
    localList.forEach((r) => {
      idMap.set(r.id, { ...(idMap.get(r.id) || {}), ...r });
    });

    return Array.from(idMap.values());
  }

  /**
   * Fetch reservations by restaurant tenant with safe schema column selection and in-memory VIP resolution
   */
  async getReservationsByRestaurant(restaurantId, filters = {}) {
    if (!restaurantId) {
      throw new Error('restaurant_id is required.');
    }

    let records = [];

    // 1. Safe Supabase query - Guaranteed to only read existing table columns (no unmigrated is_vip column)
    try {
      let query = supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_id', restaurantId);

      if (filters.date) {
        query = query.eq('date', filters.date);
      }
      if (filters.status) {
        query = query.eq('status', filters.status.toUpperCase());
      }

      const sortField = filters.sort === 'reservation_time' ? 'time' : (filters.sort || 'created_at');
      const ascending = filters.order ? filters.order.toLowerCase() === 'asc' : false;

      const { data, error } = await query.order(sortField, { ascending });
      if (!error && data) {
        records = data.map(normalizeReservation);
      } else if (error) {
        console.warn('[Reservations Supabase Fetch Warning]:', error.message);
        // Production: surface the failure instead of showing an empty/stale list
        if (!allowLocalFallback) throw new Error(`Reservation lookup failed: ${error.message}`);
      }
    } catch (err) {
      console.warn('[Reservations Supabase Fetch Fallback]:', err.message);
      if (!allowLocalFallback) throw err;
    }

    // 2. Disk & Memory Fallback / Merge
    const persistedRes = loadPersisted(RES_FILE, DEFAULT_RESERVATIONS);
    const localList = (persistedRes[restaurantId] || localReservationsStore[restaurantId] || []).map(normalizeReservation);

    const idMap = new Map();
    records.forEach((r) => idMap.set(r.id, r));
    localList.forEach((r) => {
      idMap.set(r.id, { ...(idMap.get(r.id) || {}), ...r });
    });

    let mergedRecords = Array.from(idMap.values());

    if (filters.date) {
      mergedRecords = mergedRecords.filter((r) => (r.date || r.reservation_date) === filters.date);
    }
    if (filters.status) {
      mergedRecords = mergedRecords.filter(
        (r) => (r.status || '').toUpperCase() === filters.status.toUpperCase()
      );
    }

    // 3. Safe In-Memory VIP and CRM tag resolution wrapped in try/catch (never crashes, defaults is_vip: false)
    try {
      const customers = await this.getCustomersByRestaurant(restaurantId);
      const crmLookup = {};
      for (const c of customers || []) {
        if (c.phone) crmLookup[c.phone.trim()] = c;
        if (c.email) crmLookup[c.email.trim().toLowerCase()] = c;
      }

      mergedRecords = mergedRecords.map((r) => {
        const phone = (r.phone || r.customer_phone || '').trim();
        const email = (r.email || r.customer_email || '').trim().toLowerCase();
        const guestCrm = (phone && crmLookup[phone]) || (email && crmLookup[email]);

        const isVip = guestCrm ? Boolean(guestCrm.is_vip || (guestCrm.tags || '').toLowerCase().includes('vip')) : false;

        return {
          ...r,
          is_vip: isVip,
          guest_is_vip: isVip,
          guest_no_show_count: guestCrm ? guestCrm.no_show_count || 0 : 0,
          guest_visit_count: guestCrm ? guestCrm.visit_count || 0 : 0,
          guest_crm_tags: guestCrm ? guestCrm.tags || 'Regular' : 'Regular'
        };
      });
    } catch (crmErr) {
      console.warn('[In-memory CRM VIP resolution warning]:', crmErr.message);
      mergedRecords = mergedRecords.map((r) => ({
        ...r,
        is_vip: false,
        guest_is_vip: false,
        guest_no_show_count: 0,
        guest_visit_count: 0,
        guest_crm_tags: 'Regular'
      }));
    }

    return mergedRecords;
  }

  async getReservationById(id) {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return normalizeReservation(data);
      }

      if (error && !allowLocalFallback) {
        // Non-UUID ids simply do not exist; anything else is a real failure
        if (error.code === '22P02') return null;
        throw new Error(`Reservation lookup failed: ${error.message}`);
      }
    } catch (err) {
      if (!allowLocalFallback) throw err;
    }

    if (!allowLocalFallback) return null;

    const persistedRes = loadPersisted(RES_FILE, DEFAULT_RESERVATIONS);
    for (const tenantId in persistedRes) {
      const found = persistedRes[tenantId].find((r) => r.id === id);
      if (found) return normalizeReservation(found);
    }

    for (const tenantId in localReservationsStore) {
      const found = localReservationsStore[tenantId].find((r) => r.id === id);
      if (found) return normalizeReservation(found);
    }

    return null;
  }

  /**
   * Read-Only VIP & 3-Strike No-Show check for incoming guests (Additive logic)
   */
  async checkGuestStatus(restaurantId, { phone, email, name } = {}) {
    if (!restaurantId) throw new Error('restaurant_id is required.');
    const cleanPhone = (phone || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();

    if (!cleanPhone && !cleanEmail && !cleanName) {
      return {
        is_vip: false,
        no_show_count: 0,
        is_blocked: false,
        block_reason: null,
        visit_count: 0,
        tags: 'Guest',
        message: null
      };
    }

    const customers = await this.getCustomersByRestaurant(restaurantId);
    let matchedCustomer = customers.find(
      (c) =>
        (cleanPhone && c.phone && c.phone.trim() === cleanPhone) ||
        (cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail) ||
        (cleanName && c.name && c.name.trim().toLowerCase() === cleanName)
    );

    const noShowCount = matchedCustomer?.no_show_count || 0;
    const isVip = Boolean(matchedCustomer?.is_vip || (matchedCustomer?.tags || '').toLowerCase().includes('vip'));
    const isBlocked = noShowCount >= 3;

    return {
      is_vip: isVip,
      no_show_count: noShowCount,
      is_blocked: isBlocked,
      block_reason: isBlocked ? 'NO_SHOW_STRIKE_LIMIT' : null,
      visit_count: matchedCustomer?.visit_count || 0,
      tags: matchedCustomer?.tags || (isVip ? 'VIP' : 'Regular'),
      message: isBlocked
        ? 'Online reservations are currently unavailable for this contact due to 3 or more recorded past no-shows. Please contact the restaurant directly by phone to book.'
        : null
    };
  }

  /**
   * Create new reservation: Adaptive multi-stage insert with automatic fallback & 3-strike block
   */
  async createReservation(reservationData) {
    const {
      restaurant_id,
      name,
      customer_name,
      email,
      customer_email,
      phone,
      customer_phone,
      guests,
      party_size,
      date,
      reservation_date,
      time,
      reservation_time,
      duration_minutes = 90,
      special_requests,
      table_id,
      status = 'PENDING',
      source = 'WEB'
    } = reservationData;

    // Never fall back to another restaurant
    if (!restaurant_id) {
      throw new Error('restaurant_id is required to create a reservation.');
    }

    const resolvedName = (name || customer_name || 'Guest').trim();
    const resolvedEmail = (email || customer_email || '').trim() || null;
    const resolvedPhone = (phone || customer_phone || '').trim() || null;
    const resolvedGuests = parseInt(guests || party_size || 2, 10);
    const resolvedDate = date || reservation_date;
    const resolvedTime = time || reservation_time;

    // 0. Read-only VIP check and 3-strike No-Show block
    const guestCheck = await this.checkGuestStatus(restaurant_id, {
      phone: resolvedPhone,
      email: resolvedEmail,
      name: resolvedName
    });

    if (guestCheck.is_blocked) {
      const blockError = new Error(
        'Online reservations are currently unavailable for this contact due to 3 or more recorded past no-shows. Please contact the restaurant directly by phone to book.'
      );
      blockError.code = 'NO_SHOW_STRIKE_LIMIT';
      blockError.status = 403;
      blockError.no_show_count = guestCheck.no_show_count;
      throw blockError;
    }

    const isVip = guestCheck.is_vip;

    let generatedUuid;
    try {
      generatedUuid = crypto.randomUUID();
    } catch (e) {
      generatedUuid = `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const cancellationToken =
      crypto
        .randomBytes(32)
        .toString('hex');

    const cancellationTokenHash =
      crypto
        .createHash('sha256')
        .update(cancellationToken)
        .digest('hex');

    const fullPayload = {
      id: generatedUuid,
      restaurant_id,
      cancellation_token_hash: cancellationTokenHash,
      name: resolvedName,
      email: resolvedEmail,
      phone: resolvedPhone || '', // reservations.phone is NOT NULL; phone is optional in the widget
      guests: resolvedGuests,
      date: resolvedDate,
      time: resolvedTime,
      duration_minutes: parseInt(duration_minutes, 10) || 90,
      table_id: table_id || null,
      special_requests: (special_requests || '').trim() || null,
      status: status.toUpperCase(),
      source: source.toUpperCase(),
      guest_is_vip: isVip,
      guest_crm_tags: isVip ? 'VIP' : 'Regular'
    };

    let insertedRecord = null;

    // 1. Try full payload insert
    try {
      const { data, error } = await supabase
        .from('reservations')
        .insert([fullPayload])
        .select()
        .single();

      if (!error && data) {
        insertedRecord = data;
      } else if (error) {
        console.warn('[Reservation Insert Full Stage Warning]:', error.message);

        // 2. Try inserting core columns only (in case extended columns are pending migration)
        const corePayload = {
          id: generatedUuid,
          restaurant_id,
          cancellation_token_hash: cancellationTokenHash,
          name: resolvedName,
          email: resolvedEmail,
          phone: resolvedPhone || '',
          guests: resolvedGuests,
          date: resolvedDate,
          time: resolvedTime,
          special_requests: fullPayload.special_requests,
          status: fullPayload.status,
          source: fullPayload.source
        };

        const { data: coreData, error: coreError } = await supabase
          .from('reservations')
          .insert([corePayload])
          .select()
          .single();

        if (!coreError && coreData) {
          insertedRecord = coreData;
        } else {
          console.warn('[Reservation Insert Core Stage Warning]:', coreError?.message);
        }
      }
    } catch (dbErr) {
      console.warn('[Reservation Insert DB Exception]:', dbErr.message);
    }

    // Production: never confirm a booking that was not stored in the database
    if (!insertedRecord && !allowLocalFallback) {
      const saveError = new Error('The reservation could not be saved. Please try again.');
      saveError.code = 'RESERVATION_NOT_SAVED';
      saveError.status = 503;
      throw saveError;
    }

    // 3. In-Memory Fallback if Supabase is offline or unprovisioned (development only)
    if (!insertedRecord) {
      insertedRecord = {
        ...fullPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (!localReservationsStore[restaurant_id]) {
        localReservationsStore[restaurant_id] = [];
      }
      localReservationsStore[restaurant_id].unshift(insertedRecord);
      savePersisted(RES_FILE, localReservationsStore);
    }

    // Automatically upsert to Guest CRM asynchronously (safe non-blocking)
    try {
      this.upsertCustomer(restaurant_id, {
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        special_requests: fullPayload.special_requests
      }).catch((err) => console.warn('[CRM Auto-Upsert Warning]:', err.message));
    } catch (crmErr) { }

    return {

      ...normalizeReservation(

        insertedRecord

      ),

      cancellation_token:

        cancellationToken

    };
  }

  /**
   * Helper: Update reservation status in Supabase handling case & constraint checks safely
   */
  async _updateSupabaseStatusSafely(idOrCode, targetStatus, extraPayload = {}) {
    const rawUpper = (targetStatus || '').toUpperCase().trim();
    const rawLower = (targetStatus || '').toLowerCase().trim();

    // Priority list of status candidates to try against DB constraint
    const candidates = [];
    if (rawLower === 'cancelled' || rawLower === 'canceled') {
      candidates.push('cancelled', 'CANCELLED', 'canceled', 'CANCELED', 'DECLINED', 'declined');
    } else if (rawLower === 'declined') {
      candidates.push('declined', 'DECLINED', 'cancelled', 'CANCELLED');
    } else {
      candidates.push(rawLower, rawUpper);
    }

    let updatedRecord = null;
    let constraintError = null;

    for (const st of candidates) {
      try {
        const payload = { status: st, ...extraPayload };

        // 1. Try by 'id'
        const { data, error } = await supabase
          .from('reservations')
          .update(payload)
          .eq('id', idOrCode)
          .select()
          .single();

        if (!error && data) {
          updatedRecord = data;
          break;
        }

        if (error) {
          // If error is due to updated_at / extra column, retry with status only
          if (Object.keys(extraPayload).length > 0) {
            const { data: statusOnlyData, error: statusOnlyError } = await supabase
              .from('reservations')
              .update({ status: st })
              .eq('id', idOrCode)
              .select()
              .single();

            if (!statusOnlyError && statusOnlyData) {
              updatedRecord = statusOnlyData;
              break;
            }
          }

          if (error.code === '23514' || error.message?.includes('reservations_status_check')) {
            constraintError = error;
            continue; // try next candidate
          }
        }

        // 2. Try by 'code'
        const { data: codeData, error: codeError } = await supabase
          .from('reservations')
          .update({ status: st })
          .eq('code', idOrCode)
          .select()
          .single();

        if (!codeError && codeData) {
          updatedRecord = codeData;
          break;
        }

        if (codeError && (codeError.code === '23514' || codeError.message?.includes('reservations_status_check'))) {
          constraintError = codeError;
          continue;
        }
      } catch (err) {
        constraintError = err;
      }
    }

    if (!updatedRecord && constraintError) {
      console.error('[Supabase reservations_status_check Violation] Incoming Payload:', { id: idOrCode, status: targetStatus });
      console.error('[Supabase Allowed Status Values in schema.sql]: PENDING, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW, DECLINED (or lowercase variants)');
      console.error('[Supabase Constraint Error Details]:', constraintError.message || constraintError);
    }

    return updatedRecord;
  }

  /**
   * Update reservation status with Front of House lifecycle timestamps and schema error fallback
   */
  async updateReservationStatus(id, newStatus) {
    const rawUpper = (newStatus || '').toUpperCase().trim();
    const rawLower = (newStatus || '').toLowerCase().trim();
    const normalizedStatus = (rawLower === 'cancelled' || rawLower === 'canceled') ? 'CANCELLED' : rawUpper;

    const extraPayload = {
      updated_at: new Date().toISOString()
    };

    if (normalizedStatus === 'SEATED') {
      extraPayload.seated_at = new Date().toISOString();
    } else if (normalizedStatus === 'COMPLETED') {
      extraPayload.completed_at = new Date().toISOString();
    }

    // Attempt safe DB update with constraint fallback
    let updatedRecord = await this._updateSupabaseStatusSafely(id, rawLower, extraPayload);

    // Keep in-memory store in sync as well
    for (const tenantId in localReservationsStore) {
      const found = localReservationsStore[tenantId].find((r) => r.id === id || r.code === id);
      if (found) {
        found.status = normalizedStatus;
        if (normalizedStatus === 'SEATED') found.seated_at = extraPayload.seated_at;
        if (normalizedStatus === 'COMPLETED') found.completed_at = extraPayload.completed_at;
        found.updated_at = extraPayload.updated_at;
        if (!updatedRecord) {
          updatedRecord = found;
        }
        savePersisted(RES_FILE, localReservationsStore);
        break;
      }
    }

    if (!updatedRecord) {
      // Production: report the failed write instead of fabricating an updated record
      if (!allowLocalFallback) return null;

      updatedRecord = {
        id,
        status: normalizedStatus,
        ...extraPayload
      };
    }

    const normalized = normalizeReservation(updatedRecord);

    // Automatic No-Show Tracking in CRM
    if (normalizedStatus === 'NO_SHOW' && normalized) {
      const phone = normalized.phone || normalized.customer_phone;
      const email = normalized.email || normalized.customer_email;
      const name = normalized.name || normalized.customer_name;
      const restaurantId = normalized.restaurant_id;

      if (restaurantId && (phone || email)) {
        this.incrementNoShow(restaurantId, { phone, email, name }).catch((e) => {
          console.warn('[Auto No-Show Tracking Error]:', e.message);
        });
      }
    }

    return normalized;
  }

async getReservationByCancellationToken(
  cancellationToken
) {
  if (!cancellationToken) {
    return null;
  }

  const cancellationTokenHash =
    crypto
      .createHash('sha256')
      .update(cancellationToken)
      .digest('hex');

  try {
    const {
      data,
      error
    } = await supabase
      .from('reservations')
      .select('*')
      .eq(
        'cancellation_token_hash',
        cancellationTokenHash
      )
      .maybeSingle();

    if (error) {
      console.error(
        '[Cancellation Token Lookup Error]:',
        error
      );

      return null;
    }

    if (data) {
      return normalizeReservation(data);
    }

  } catch (err) {
    console.error(
      '[Cancellation Token Lookup Exception]:',
      err
    );
  }

  return null;
}

  /**
   * Cancel reservation by ID or code (soft update to CANCELLED instead of hard delete)
   */
  async cancelReservation(
  cancellationToken
) {
  if (!cancellationToken) {
    throw new Error(
      'Ein Stornierungstoken ist erforderlich.'
    );
  }

  const reservation =
    await this.getReservationByCancellationToken(
      cancellationToken
    );

  if (!reservation) {
    const error =
      new Error(
        'Der Stornierungslink ist ungültig oder nicht mehr verfügbar.'
      );

    error.code =
      'INVALID_CANCELLATION_TOKEN';

    error.status =
      404;

    throw error;
  }

  const nowIso =
    new Date().toISOString();

  const updatedRecord =
    await this._updateSupabaseStatusSafely(
      reservation.id,
      'cancelled',
      {
        updated_at: nowIso
      }
    );

  if (!updatedRecord) {
    throw new Error(
      'Die Reservierung konnte nicht storniert werden. Bitte versuchen Sie es erneut.'
    );
  }

  return normalizeReservation(
    updatedRecord
  );
}

  /**
   * Toggle VIP status for a reservation & its guest in CRM
   */
  async toggleReservationVip(restaurantId, reservationId, isVip) {
    let targetReservation = null;

    // 1. Check local in-memory store
    for (const tenantId in localReservationsStore) {
      const found = localReservationsStore[tenantId].find((r) => r.id === reservationId);
      if (found) {
        found.guest_is_vip = Boolean(isVip);
        const tags = (found.guest_crm_tags || 'Regular').split(',').map((t) => t.trim()).filter(Boolean);
        const filtered = tags.filter((t) => !t.toLowerCase().includes('vip'));
        if (isVip) filtered.unshift('VIP');
        found.guest_crm_tags = filtered.join(', ') || 'Regular';
        targetReservation = found;
        break;
      }
    }

    // 2. Fetch from Supabase if not found locally
    if (!targetReservation) {
      try {
        const { data } = await supabase.from('reservations').select('*').eq('id', reservationId).single();
        if (data) targetReservation = data;
      } catch (e) { }
    }

    const resolvedTags = isVip ? 'VIP' : 'Regular';

    // 3. Update Supabase reservation record
    try {
      const { data } = await supabase
        .from('reservations')
        .update({
          guest_is_vip: Boolean(isVip),
          guest_crm_tags: resolvedTags
        })
        .eq('id', reservationId)
        .select()
        .single();

      if (data) targetReservation = data;
    } catch (e) { }

    // 4. Update or Insert into localCustomerCRM and Supabase customers
    const phone = targetReservation?.phone || targetReservation?.customer_phone;
    const email = targetReservation?.email || targetReservation?.customer_email;
    const name = targetReservation?.name || targetReservation?.customer_name || 'Guest';
    const restId = restaurantId || targetReservation?.restaurant_id;
    if (!restId) {
      throw new Error('restaurant_id is required to update VIP status.');
    }

    if (!localCustomerCRM[restId]) localCustomerCRM[restId] = [];
    const existingCust = localCustomerCRM[restId].find(
      (c) => (phone && c.phone === phone) || (email && c.email === email)
    );

    // Local CRM mirror is development-only; production relies on the customers table below
    if (allowLocalFallback && existingCust) {
      existingCust.is_vip = Boolean(isVip);
      const tags = (existingCust.tags || 'Regular').split(',').map((t) => t.trim()).filter(Boolean);
      const filtered = tags.filter((t) => !t.toLowerCase().includes('vip'));
      if (isVip) filtered.unshift('VIP');
      existingCust.tags = filtered.join(', ') || 'Regular';
    } else if (allowLocalFallback && (phone || email)) {
      localCustomerCRM[restId].push({
        id: `crm-${Date.now()}`,
        restaurant_id: restId,
        name,
        phone,
        email,
        visit_count: 1,
        no_show_count: 0,
        total_covers: 2,
        tags: resolvedTags,
        notes: '',
        is_vip: Boolean(isVip),
        updated_at: new Date().toISOString()
      });
    }

    // Update this restaurant's guest profile only. Separate equality filters instead of an
    // interpolated .or() string, so guest-supplied phone/email cannot alter the filter.
    const customerUpdate = { tags: resolvedTags, updated_at: new Date().toISOString() };
    const customerFilters = [];
    if (phone) customerFilters.push(['phone', phone]);
    if (email) customerFilters.push(['email', email]);

    for (const [column, value] of customerFilters) {
      try {
        const { error } = await supabase
          .from('customers')
          .update(customerUpdate)
          .eq('restaurant_id', restId)
          .eq(column, value);

        if (error) {
          console.warn('[VIP Toggle Customer Update Warning]:', error.message);
          if (!allowLocalFallback) throw new Error(`VIP status could not be saved: ${error.message}`);
        }
      } catch (e) {
        if (!allowLocalFallback) throw e;
      }
    }

    savePersisted(CRM_FILE, localCustomerCRM);
    savePersisted(RES_FILE, localReservationsStore);

    return targetReservation
      ? { ...normalizeReservation(targetReservation), guest_is_vip: Boolean(isVip), guest_crm_tags: resolvedTags }
      : { id: reservationId, guest_is_vip: Boolean(isVip), guest_crm_tags: resolvedTags };
  }
}

module.exports = new ReservationService();
