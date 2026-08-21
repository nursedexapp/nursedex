-- Published blog covers still served from the original Supabase project host
-- (#744). The app was never repointed onto the custom domain, so these stored
-- absolute URLs are live dependencies, not historical artifacts.
--
-- Read-only. Selects three columns from one table and touches nothing.
select cover_image_url
from public.blog_posts
where status = 'published'
  and cover_image_url is not null;
