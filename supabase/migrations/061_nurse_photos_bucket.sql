-- ============================================================
-- Create the nurse-photos bucket in SQL, instead of by hand (#485)
-- ============================================================
-- Migration 016 added RLS policies to the nurse-photos bucket and opens with
-- "The nurse-photos bucket exists". It exists in PRODUCTION, because somebody
-- created it in the dashboard. It has never existed anywhere else.
--
-- So no database built from these migrations has the bucket a nurse's photo is
-- uploaded into: not a fresh local one, not the one CI builds. A photo is
-- REQUIRED to finish onboarding (step4Schema: photos.min(1)), which means the
-- entire nurse onboarding journey was impossible to test end to end, and so it
-- never was. That is not a coincidence: infrastructure that only exists by hand
-- in production cannot be exercised anywhere else, and what cannot be exercised
-- does not get tested.
--
-- Migration 027 already does this properly for blog-images. This brings
-- nurse-photos up to the same standard: the bucket, and its configuration, are
-- now code.
--
-- The values mirror production exactly (private, 5 MB, image types only), read
-- from storage.buckets on the live database, so applying this changes nothing
-- there. Private on purpose: nurse photos are served through short-lived signed
-- URLs (src/lib/profile/photos.ts), never straight from the bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nurse-photos',
  'nurse-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
