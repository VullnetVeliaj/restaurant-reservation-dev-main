-- ==============================================================================
-- Supabase SQL Schema Blueprint & Migration Script
-- Multi-Tenant SaaS: Restaurants, RBAC Users, Settings, Shifts, CRM & Bookings
-- ==============================================================================

-- 1. Table: restaurants (Business Branding & Tenant Root)
CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#0284c7',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table: restaurant_users (Staff & Manager RBAC Accounts)
CREATE TABLE IF NOT EXISTS restaurant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF' CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table: restaurant_settings (Capacity & Booking Rules)
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    max_covers_per_slot INTEGER NOT NULL DEFAULT 20,
    slot_interval_minutes INTEGER NOT NULL DEFAULT 15,
    min_advance_notice_mins INTEGER NOT NULL DEFAULT 60,
    max_advance_days INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table: restaurant_shifts (Operating Schedules)
CREATE TABLE IF NOT EXISTS restaurant_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    shift_name TEXT NOT NULL DEFAULT 'Dinner',
    start_time TIME NOT NULL DEFAULT '17:00',
    end_time TIME NOT NULL DEFAULT '22:30',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table: customers (Guest CRM & History)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    visit_count INTEGER NOT NULL DEFAULT 1,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT 'Regular',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_customer_tenant_email UNIQUE(restaurant_id, email)
);

-- 6. Table: reservations (Live Operational Bookings)
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL DEFAULT 'rest-001',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    guests INTEGER NOT NULL DEFAULT 2,
    date DATE NOT NULL,
    time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 90,
    table_id TEXT,
    special_requests TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DECLINED')),
    source TEXT NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB', 'MANUAL', 'PHONE')),
    seated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance & Multi-Tenant Indexes
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_users_restaurant_id ON restaurant_users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON restaurant_users(email);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_date ON reservations(restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_day ON restaurant_shifts(restaurant_id, day_of_week);

-- Row Level Security (RLS) Policies & Unrestricted Updates
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on restaurants" ON restaurants FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert on restaurants" ON restaurants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public all on restaurants" ON restaurants FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on restaurant_users" ON restaurant_users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on restaurant_settings" ON restaurant_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on restaurant_shifts" ON restaurant_shifts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all on reservations" ON reservations FOR ALL TO anon USING (true) WITH CHECK (true);

-- Ensure unrestricted updates on reservations
DROP POLICY IF EXISTS "Allow public cancel by id" ON reservations;
DROP POLICY IF EXISTS "Allow admin full access" ON reservations;
DROP POLICY IF EXISTS "Allow staff update" ON reservations;
DROP POLICY IF EXISTS "Allow all updates" ON reservations;
CREATE POLICY "Allow all updates" ON reservations FOR UPDATE USING (true) WITH CHECK (true);

-- Default Tenant Seed Data (Grand Bistro, Sakura Sushi, Trattoria Bella)
INSERT INTO restaurants (id, name, slug, primary_color)
VALUES 
  ('rest-001', 'Grand Bistro', 'grand-bistro', '#0284c7'),
  ('rest-002', 'Sakura Sushi Lounge', 'sakura-sushi', '#ec4899'),
  ('rest-003', 'Trattoria Bella', 'trattoria-bella', '#f59e0b')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, primary_color = EXCLUDED.primary_color;

-- Seed Settings
INSERT INTO restaurant_settings (restaurant_id, timezone, max_covers_per_slot, slot_interval_minutes, min_advance_notice_mins, max_advance_days)
VALUES 
  ('rest-001', 'America/New_York', 20, 15, 60, 30),
  ('rest-002', 'America/New_York', 16, 15, 60, 30),
  ('rest-003', 'America/New_York', 24, 15, 60, 30)
ON CONFLICT (restaurant_id) DO NOTHING;

-- Seed Shifts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurant_shifts WHERE restaurant_id = 'rest-001') THEN
    FOR day IN 0..6 LOOP
      INSERT INTO restaurant_shifts (restaurant_id, day_of_week, shift_name, start_time, end_time, is_active)
      VALUES 
        ('rest-001', day, 'Lunch', '11:30', '14:30', true),
        ('rest-001', day, 'Dinner', '17:00', '22:30', true);
    END LOOP;
  END IF;
END $$;

-- Status Check Constraint Upgrade
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
CHECK (status IN ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DECLINED'));

-- Migration: Ensure updated_at & lifecycle columns exist and reload PostgREST schema cache
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';



