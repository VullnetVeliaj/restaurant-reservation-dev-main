-- =====================================================================
-- 2026-10-10: Restaurant cover photos
--   * restaurants.cover_image_url: public URL of the restaurant's cover
--     photo (shown on the public homepage). Separate from logo_url.
--   * Public storage bucket `restaurant-images` (5 MB, PNG/JPEG/WebP).
--     Files live under <restaurant_id>/cover-*. The browser uploads via a
--     backend-issued signed upload URL for its own restaurant only; the
--     backend validates the file content before saving the URL.
-- Idempotent: safe to run more than once.
-- =====================================================================
BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'restaurants_cover_image_url_https'
      AND conrelid = 'public.restaurants'::regclass
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_cover_image_url_https
      CHECK (cover_image_url IS NULL OR (cover_image_url LIKE 'https://%' AND char_length(cover_image_url) <= 1000));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('restaurant-images', 'restaurant-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

NOTIFY pgrst, 'reload schema';
