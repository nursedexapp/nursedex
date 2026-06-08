-- ============================================================
-- Blog comments (pre-moderated)
-- ============================================================
--
-- Readers submit a name/email/body comment (no account). Comments are held
-- as `pending` until an admin approves them, so only approved comments are
-- ever shown publicly. All access goes through server-side service-role
-- code (submit, public read of approved, admin moderation), so RLS exposes
-- nothing to anon; an admin policy is the backstop for direct access.

CREATE TYPE blog_comment_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.blog_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_email text NOT NULL,
  body text NOT NULL,
  status blog_comment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_comments_post ON public.blog_comments (post_id, status);
CREATE INDEX idx_blog_comments_pending ON public.blog_comments (status)
  WHERE status = 'pending';

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_comments_admin ON public.blog_comments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
