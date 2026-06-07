-- ============================================================
-- Blog
-- ============================================================
--
-- Database backed blog managed through the /admin panel. Posts are
-- authored as Tiptap ProseMirror JSON (content), support drafts,
-- scheduled publishing (publish_at in the future), and a public
-- index + per-post pages once published. Public reads are limited to
-- published rows; all writes are admin only via public.is_admin().

-- ─── Enum ───────────────────────────────────────────────────

CREATE TYPE blog_post_status AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- ─── Table ──────────────────────────────────────────────────

CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content jsonb NOT NULL,
  cover_image_url text,
  status blog_post_status NOT NULL DEFAULT 'draft',
  publish_at timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────

-- Admin list filtered by status
CREATE INDEX idx_blog_posts_status ON public.blog_posts (status);

-- Cron lookup for scheduled posts whose time has passed
CREATE INDEX idx_blog_posts_scheduled ON public.blog_posts (publish_at)
  WHERE status = 'scheduled';

-- Public index: published posts ordered by publish_at
CREATE INDEX idx_blog_posts_published ON public.blog_posts (publish_at DESC)
  WHERE status = 'published';

-- ─── updated_at trigger ─────────────────────────────────────

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can read published posts. A published
-- row always has publish_at set in the past because the publish action
-- stamps it, so no extra time check is needed here.
CREATE POLICY blog_posts_select_published ON public.blog_posts
  FOR SELECT USING (status = 'published');

-- Admins can read every post (drafts, scheduled, archived)
CREATE POLICY blog_posts_select_admin ON public.blog_posts
  FOR SELECT USING (public.is_admin());

-- Admins can create, update, and delete posts
CREATE POLICY blog_posts_insert_admin ON public.blog_posts
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY blog_posts_update_admin ON public.blog_posts
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY blog_posts_delete_admin ON public.blog_posts
  FOR DELETE USING (public.is_admin());
