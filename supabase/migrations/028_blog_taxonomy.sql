-- ============================================================
-- Blog taxonomy: categories (one per post) and tags (many per post)
-- ============================================================
--
-- Categories are a small curated set used for top-level grouping and
-- navigation; a post has at most one. Tags are free-form and many-to-many.
-- Both get public archive pages. Public can read taxonomy (to render chips
-- and archives); only admins can write it.

-- ─── Tables ─────────────────────────────────────────────────

CREATE TABLE public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts
  ADD COLUMN category_id uuid REFERENCES public.blog_categories(id) ON DELETE SET NULL;

CREATE TABLE public.blog_post_tags (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ─── Indexes ────────────────────────────────────────────────

CREATE INDEX idx_blog_posts_category ON public.blog_posts (category_id);
CREATE INDEX idx_blog_post_tags_tag ON public.blog_post_tags (tag_id);

-- ─── updated_at trigger ─────────────────────────────────────

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.blog_categories
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;

-- Anyone may read taxonomy (chips on posts, archive pages).
CREATE POLICY blog_categories_select_all ON public.blog_categories
  FOR SELECT USING (true);
CREATE POLICY blog_tags_select_all ON public.blog_tags
  FOR SELECT USING (true);
CREATE POLICY blog_post_tags_select_all ON public.blog_post_tags
  FOR SELECT USING (true);

-- Only admins create, update, or delete taxonomy.
CREATE POLICY blog_categories_admin ON public.blog_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY blog_tags_admin ON public.blog_tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY blog_post_tags_admin ON public.blog_post_tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
