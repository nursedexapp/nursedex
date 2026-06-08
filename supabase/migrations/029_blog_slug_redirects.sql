-- ============================================================
-- Blog slug redirects
-- ============================================================
--
-- When a published post's slug changes, its old public URL would 404 and
-- lose any inbound links and ranking. Record old -> new so the post route
-- can permanently redirect old slugs. Mirrors the nurse slug_redirects
-- pattern. Public can read (the redirect is served on a public page);
-- writes happen via the service-role client in the save action.

CREATE TABLE public.blog_slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_slug text NOT NULL UNIQUE,
  new_slug text NOT NULL,
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_slug_redirects_old ON public.blog_slug_redirects (old_slug);

ALTER TABLE public.blog_slug_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_slug_redirects_select_all ON public.blog_slug_redirects
  FOR SELECT USING (true);

CREATE POLICY blog_slug_redirects_admin ON public.blog_slug_redirects
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
