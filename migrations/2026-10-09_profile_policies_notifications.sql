-- =====================================================================
-- Migration: restaurant profile, booking policies, notification preferences,
--            logo storage bucket
-- Date: 2026-10-09
--
-- Run manually in the Supabase SQL editor BEFORE relying on the new Settings
-- sections. Requires the two earlier migrations (2026-10-07, 2026-10-08).
--
-- Safe to run more than once. Only ADDS nullable columns or columns with
-- defaults that reproduce the current behaviour exactly, so existing
-- restaurants keep working unchanged:
--   * min/max party size 1..50   (the booking widget's current limits)
--   * reservation duration 90 min (current hard-coded value)
--   * manual confirmation         (web bookings are PENDING today)
--   * no cancellation cutoff      (guests can cancel any time today)
--   * same-day bookings allowed
--   * guest emails on, owner emails off (current behaviour)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Restaurant profile (public business details) on restaurants
-- ---------------------------------------------------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS cuisine_type  TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS website       TEXT,
  ADD COLUMN IF NOT EXISTS street        TEXT,
  ADD COLUMN IF NOT EXISTS postal_code   TEXT,
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT;

-- ---------------------------------------------------------------------
-- 2. Booking policies + notification preferences on restaurant_settings
-- ---------------------------------------------------------------------
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS min_party_size                  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_party_size                  INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS reservation_duration_minutes    INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS auto_confirm                    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS same_day_booking                BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_guest_on_booking         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_guest_on_status_change   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_guest_on_cancellation    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_owner_on_new_reservation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_owner_on_cancellation    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_notification_email        TEXT;

-- ---------------------------------------------------------------------
-- 3. Value constraints (added once; all existing rows satisfy them because
--    new columns are NULL or take the defaults above)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.ensure_check(p_table regclass, p_name text, p_expr text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = p_table AND conname = p_name) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s)', p_table, p_name, p_expr);
  END IF;
END $$;

SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_description_len', 'description IS NULL OR char_length(description) <= 500');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_cuisine_type_len', 'cuisine_type IS NULL OR char_length(cuisine_type) <= 80');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_contact_email_len', 'contact_email IS NULL OR char_length(contact_email) <= 254');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_phone_len', 'phone IS NULL OR char_length(phone) <= 40');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_website_len', 'website IS NULL OR char_length(website) <= 300');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_street_len', 'street IS NULL OR char_length(street) <= 160');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_postal_code_len', 'postal_code IS NULL OR char_length(postal_code) <= 20');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_city_len', 'city IS NULL OR char_length(city) <= 100');
SELECT pg_temp.ensure_check('public.restaurants', 'restaurants_country_len', 'country IS NULL OR char_length(country) <= 100');

SELECT pg_temp.ensure_check('public.restaurant_settings', 'restaurant_settings_party_size_range',
  'min_party_size BETWEEN 1 AND 100 AND max_party_size BETWEEN 1 AND 500 AND min_party_size <= max_party_size');
SELECT pg_temp.ensure_check('public.restaurant_settings', 'restaurant_settings_duration_range',
  'reservation_duration_minutes BETWEEN 15 AND 480');
SELECT pg_temp.ensure_check('public.restaurant_settings', 'restaurant_settings_cancellation_cutoff_range',
  'cancellation_cutoff_hours BETWEEN 0 AND 168');
SELECT pg_temp.ensure_check('public.restaurant_settings', 'restaurant_settings_owner_email_len',
  'owner_notification_email IS NULL OR char_length(owner_notification_email) <= 254');

-- ---------------------------------------------------------------------
-- 4. Public storage bucket for restaurant logos.
--    Uploads happen only through the backend (service key); the bucket is
--    public so the stored logo URL can be shown in the admin and widget.
--    2 MB limit, raster images only (no SVG: it can carry scripts).
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('restaurant-logos', 'restaurant-logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

NOTIFY pgrst, 'reload schema';
