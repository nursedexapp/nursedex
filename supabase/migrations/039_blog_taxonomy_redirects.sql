-- ============================================================
-- Blog taxonomy slug redirects
-- ============================================================
--
-- Renaming or merging a category/tag changes its archive slug. This records
-- old -> new so the old /blog/category/<slug> and /blog/tag/<slug> URLs keep
-- working. Mirrors blog_slug_redirects (for posts). All access is server
-- side via service-role; admin policy is the backstop.

CREATE TYPE blog_taxonomy_kind AS ENUM ('category', 'tag');

CREATE TABLE public.blog_taxonomy_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind blog_taxonomy_kind NOT NULL,
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, old_slug)
);

CREATE INDEX idx_blog_taxonomy_redirects_lookup
  ON public.blog_taxonomy_redirects (kind, old_slug);

ALTER TABLE public.blog_taxonomy_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_taxonomy_redirects_admin ON public.blog_taxonomy_redirects
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
