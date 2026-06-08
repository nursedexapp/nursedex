-- ============================================================
-- Blog full text search
-- ============================================================
--
-- Search over a post's title, excerpt, and body. The body lives as Tiptap
-- JSON, which is awkward to index directly, so the app stores a flattened
-- plain-text copy in content_text on save (see src/lib/blog/text.ts). The
-- generated search_vector combines the three and is GIN indexed.

ALTER TABLE public.blog_posts ADD COLUMN content_text text;

ALTER TABLE public.blog_posts
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(excerpt, '') || ' ' ||
      coalesce(content_text, '')
    )
  ) STORED;

CREATE INDEX idx_blog_posts_search ON public.blog_posts USING gin (search_vector);
