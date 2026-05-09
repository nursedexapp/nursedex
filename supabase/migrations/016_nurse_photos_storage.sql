-- nurse-photos storage RLS
--
-- The nurse-photos bucket exists but has no RLS policies, so every
-- write was rejected with "new row violates row-level security
-- policy" and the wizard's photo upload silently failed. Allow
-- authenticated users to read/write/delete files in a folder named
-- after their own user id (the same path scheme the app already uses
-- when it calls storage.from('nurse-photos').createSignedUploadUrl(
-- userId/filename)).
--
-- Public reads still go through the service-role client and signed
-- URLs in src/lib/profile/photos.ts, so we don't add an authenticated
-- public-read policy here.

DROP POLICY IF EXISTS "Nurses upload to own nurse-photos folder"
  ON storage.objects;

CREATE POLICY "Nurses upload to own nurse-photos folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nurse-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Nurses update own nurse-photos"
  ON storage.objects;

CREATE POLICY "Nurses update own nurse-photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nurse-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'nurse-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Nurses delete own nurse-photos"
  ON storage.objects;

CREATE POLICY "Nurses delete own nurse-photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nurse-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Nurses read own nurse-photos"
  ON storage.objects;

CREATE POLICY "Nurses read own nurse-photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nurse-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
