-- blog-images storage
--
-- Public bucket for blog cover and in-body images. Unlike nurse-photos
-- (private, served through short-lived signed URLs), blog images are
-- public content that must render forever, so the bucket is public and
-- we store the permanent public URL on the post. Only admins may write;
-- public read is served directly by the bucket without an RLS policy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Admins upload blog-images" ON storage.objects;

CREATE POLICY "Admins upload blog-images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'blog-images'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins update blog-images" ON storage.objects;

CREATE POLICY "Admins update blog-images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'blog-images'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'blog-images'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins delete blog-images" ON storage.objects;

CREATE POLICY "Admins delete blog-images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'blog-images'
    AND public.is_admin()
  );
