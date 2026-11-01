-- =====================================================================
-- Migration: database integrity constraints & indexes
-- Date: 2026-10-08
--
-- Run manually in the Supabase SQL editor BEFORE deploying the matching code.
-- Requires 2026-10-07_restaurant_settings_tenant_isolation.sql to be applied.
--
-- Safe to run more than once. Never deletes or rewrites rows: every
-- constraint is guarded and aborts with a clear message if existing data
-- violates it, so conflicts can be reviewed by hand.
--
-- Checked against live data on 2026-10-08 (read-only): no duplicate widget
-- keys/slugs/emails/token hashes, no orphaned rows, no NULL tenant ids.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper: add a foreign key only if the column has none yet.
-- Added NOT VALID first (no long lock), then validated; if old rows violate
-- it, the constraint still protects all new writes and a WARNING is raised.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(
  p_table regclass,
  p_column text,
  p_ref regclass,
  p_ref_column text,
  p_name text,
  p_on_delete text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = p_table AND c.contype = 'f' AND a.attname = p_column
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s (%I) ON DELETE %s NOT VALID',
    p_table, p_name, p_column, p_ref, p_ref_column, p_on_delete
  );

  BEGIN
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'Existing rows in % violate %; constraint enforced for new rows only. Review orphans, then run: ALTER TABLE % VALIDATE CONSTRAINT %;',
      p_table, p_name, p_table, p_name;
  END;
END $$;

-- Helper: abort when a candidate unique key already has duplicates
CREATE OR REPLACE FUNCTION pg_temp.assert_no_duplicates(p_sql text, p_what text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  dup_count integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) d', p_sql) INTO dup_count;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique constraint: % has % duplicate value(s). Resolve them and re-run.', p_what, dup_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- restaurants
--   public_widget_key identifies the tenant for the public widget:
--   it must exist and be unique.
-- ---------------------------------------------------------------------
SELECT pg_temp.assert_no_duplicates(
  'SELECT public_widget_key FROM public.restaurants WHERE public_widget_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1',
  'restaurants.public_widget_key'
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_public_widget_key_key
  ON public.restaurants (public_widget_key);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurants WHERE public_widget_key IS NULL) THEN
    RAISE WARNING 'Some restaurants have no public_widget_key; NOT NULL not applied. Generate keys for them, then re-run.';
  ELSE
    ALTER TABLE public.restaurants ALTER COLUMN public_widget_key SET NOT NULL;
  END IF;
END $$;

SELECT pg_temp.assert_no_duplicates(
  'SELECT slug FROM public.restaurants GROUP BY 1 HAVING count(*) > 1',
  'restaurants.slug'
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_key ON public.restaurants (slug);

-- ---------------------------------------------------------------------
-- restaurant_users
--   Login looks users up by email (case-insensitive); tenant scoping by restaurant_id.
-- ---------------------------------------------------------------------
ALTER TABLE public.restaurant_users ALTER COLUMN restaurant_id SET NOT NULL;

SELECT pg_temp.ensure_fk('public.restaurant_users', 'restaurant_id', 'public.restaurants', 'id',
  'restaurant_users_restaurant_id_fkey', 'CASCADE');

SELECT pg_temp.assert_no_duplicates(
  'SELECT lower(email) FROM public.restaurant_users GROUP BY 1 HAVING count(*) > 1',
  'restaurant_users.email (case-insensitive)'
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_users_email_lower_key
  ON public.restaurant_users (lower(email));

CREATE INDEX IF NOT EXISTS restaurant_users_restaurant_id_idx
  ON public.restaurant_users (restaurant_id);

-- ---------------------------------------------------------------------
-- restaurant_settings (one row per restaurant was enforced by the previous migration)
-- ---------------------------------------------------------------------
SELECT pg_temp.ensure_fk('public.restaurant_settings', 'restaurant_id', 'public.restaurants', 'id',
  'restaurant_settings_restaurant_id_fkey', 'CASCADE');

-- ---------------------------------------------------------------------
-- reservations
--   * No implicit tenant: drop the legacy DEFAULT 'rest-001'.
--   * Every reservation belongs to an existing restaurant.
--   * Admin list: restaurant_id (+ created_at); availability: restaurant_id + date.
--   * Guest cancellation looks up cancellation_token_hash (must be unique).
-- ---------------------------------------------------------------------
ALTER TABLE public.reservations ALTER COLUMN restaurant_id DROP DEFAULT;
ALTER TABLE public.reservations ALTER COLUMN restaurant_id SET NOT NULL;

SELECT pg_temp.ensure_fk('public.reservations', 'restaurant_id', 'public.restaurants', 'id',
  'reservations_restaurant_id_fkey', 'CASCADE');

CREATE INDEX IF NOT EXISTS reservations_restaurant_date_idx
  ON public.reservations (restaurant_id, date);

CREATE INDEX IF NOT EXISTS reservations_restaurant_created_at_idx
  ON public.reservations (restaurant_id, created_at DESC);

SELECT pg_temp.assert_no_duplicates(
  'SELECT cancellation_token_hash FROM public.reservations WHERE cancellation_token_hash IS NOT NULL GROUP BY 1 HAVING count(*) > 1',
  'reservations.cancellation_token_hash'
);
CREATE UNIQUE INDEX IF NOT EXISTS reservations_cancellation_token_hash_key
  ON public.reservations (cancellation_token_hash)
  WHERE cancellation_token_hash IS NOT NULL;

-- ---------------------------------------------------------------------
-- customers (Guest CRM)
--   Looked up per restaurant by email or phone.
-- ---------------------------------------------------------------------
ALTER TABLE public.customers ALTER COLUMN restaurant_id SET NOT NULL;

SELECT pg_temp.ensure_fk('public.customers', 'restaurant_id', 'public.restaurants', 'id',
  'customers_restaurant_id_fkey', 'CASCADE');

SELECT pg_temp.assert_no_duplicates(
  'SELECT restaurant_id, email FROM public.customers WHERE email IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1',
  'customers (restaurant_id, email)'
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_email_key
  ON public.customers (restaurant_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_restaurant_phone_idx
  ON public.customers (restaurant_id, phone);

-- ---------------------------------------------------------------------
-- restaurant_shifts
-- ---------------------------------------------------------------------
SELECT pg_temp.ensure_fk('public.restaurant_shifts', 'restaurant_id', 'public.restaurants', 'id',
  'restaurant_shifts_restaurant_id_fkey', 'CASCADE');

CREATE INDEX IF NOT EXISTS restaurant_shifts_restaurant_day_idx
  ON public.restaurant_shifts (restaurant_id, day_of_week);

-- ---------------------------------------------------------------------
-- Auth token tables: looked up by token_hash, owned by a user
-- ---------------------------------------------------------------------
SELECT pg_temp.assert_no_duplicates(
  'SELECT token_hash FROM public.email_verification_tokens GROUP BY 1 HAVING count(*) > 1',
  'email_verification_tokens.token_hash'
);
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_token_hash_key
  ON public.email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
  ON public.email_verification_tokens (user_id);
SELECT pg_temp.ensure_fk('public.email_verification_tokens', 'user_id', 'public.restaurant_users', 'id',
  'email_verification_tokens_user_id_fkey', 'CASCADE');

SELECT pg_temp.assert_no_duplicates(
  'SELECT token_hash FROM public.password_reset_tokens GROUP BY 1 HAVING count(*) > 1',
  'password_reset_tokens.token_hash'
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_key
  ON public.password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON public.password_reset_tokens (user_id);
SELECT pg_temp.ensure_fk('public.password_reset_tokens', 'user_id', 'public.restaurant_users', 'id',
  'password_reset_tokens_user_id_fkey', 'CASCADE');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Verification (optional):
--   SELECT conrelid::regclass, conname, convalidated
--   FROM pg_constraint
--   WHERE contype = 'f' AND connamespace = 'public'::regnamespace
--   ORDER BY 1;
--
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE schemaname = 'public' ORDER BY 1, 2;
-- ---------------------------------------------------------------------
