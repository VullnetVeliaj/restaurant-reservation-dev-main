-- =====================================================================
-- Migration: restaurant_settings tenant isolation
-- Date: 2026-10-07
--
-- Why:
--   * The app stores opening hours/shifts and widget branding per restaurant,
--     but the live restaurant_settings table has no columns for them, so they
--     were never persisted (only kept in a per-server cache).
--   * Settings must be exactly one row per restaurant, addressed by
--     restaurant_id. The backend now upserts with ON CONFLICT (restaurant_id),
--     which requires a UNIQUE constraint/index on that column.
--
-- Safe to run more than once. Preserves all existing rows and values.
-- Checked against live data on 2026-10-07: 5 restaurants, 5 settings rows,
-- no duplicates, no NULL restaurant_id, id column is UUID.
-- =====================================================================

BEGIN;

-- 1. Columns the app already reads/writes
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS operating_hours JSONB,
  ADD COLUMN IF NOT EXISTS branding JSONB;

-- 2. Every settings row must belong to a restaurant
--    (fails loudly if any orphan row exists, instead of guessing which tenant it belongs to)
ALTER TABLE public.restaurant_settings
  ALTER COLUMN restaurant_id SET NOT NULL;

-- 3. Exactly one settings row per restaurant.
--    Abort if duplicates exist so they can be reviewed manually rather than deleted blindly.
DO $$
BEGIN
  IF EXISTS (
    SELECT restaurant_id
    FROM public.restaurant_settings
    GROUP BY restaurant_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate restaurant_settings rows found per restaurant_id. Resolve them before re-running this migration.';
  END IF;
END $$;

-- Only add a unique index if no unique constraint/index already covers restaurant_id alone
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.restaurant_settings'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'restaurant_id'
  ) THEN
    CREATE UNIQUE INDEX restaurant_settings_restaurant_id_key
      ON public.restaurant_settings (restaurant_id);
  END IF;
END $$;

-- 4. Give every restaurant its own settings row (defaults match the app's defaults)
INSERT INTO public.restaurant_settings (restaurant_id)
SELECT r.id
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_settings s WHERE s.restaurant_id = r.id
);

COMMIT;

-- 5. Make PostgREST (Supabase API) pick up the new columns immediately
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Verification (run after the migration):
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'restaurant_settings';
--
--   SELECT restaurant_id, COUNT(*) FROM public.restaurant_settings
--   GROUP BY restaurant_id HAVING COUNT(*) > 1;   -- must return 0 rows
-- ---------------------------------------------------------------------
