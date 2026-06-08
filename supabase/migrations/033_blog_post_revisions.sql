-- ============================================================
-- Blog post revisions
-- ============================================================
--
-- A snapshot of a post's editable body (title, excerpt, content) taken on
-- each explicit save, so an admin can view and restore prior versions.
-- Autosaves do not snapshot (they would flood the history). Admin-only;
-- all access is server-side via service-role, with an admin RLS backstop.

CREATE TABLE public.blog_post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  excerpt text,
  content jsonb NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_post_revisions_post
  ON public.blog_post_revisions (post_id, created_at DESC);

ALTER TABLE public.blog_post_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_post_revisions_admin ON public.blog_post_revisions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
