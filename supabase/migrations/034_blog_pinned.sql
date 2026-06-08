-- ============================================================
-- Featured / pinned blog posts
-- ============================================================
--
-- A pinned post floats to the top of the public blog index (ahead of the
-- chronological order). Used to feature evergreen or announcement posts.

ALTER TABLE public.blog_posts
  ADD COLUMN pinned boolean NOT NULL DEFAULT false;

-- Matches the index ordering: pinned first, then newest.
CREATE INDEX idx_blog_posts_published_pinned
  ON public.blog_posts (pinned DESC, publish_at DESC)
  WHERE status = 'published';
