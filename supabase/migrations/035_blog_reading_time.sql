-- ============================================================
-- Cached reading time
-- ============================================================
--
-- Estimated reading time in whole minutes, computed once on save from the
-- post body, so the public index and post pages do not re-walk the full
-- Tiptap document on every render.

ALTER TABLE public.blog_posts
  ADD COLUMN reading_time_minutes integer NOT NULL DEFAULT 1;
