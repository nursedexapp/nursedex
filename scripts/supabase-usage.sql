-- How much of the plan's included usage production has consumed (#746).
--
-- Read-only: two aggregates, no application data. Supabase's public API has
-- no usage endpoint at all, so these are the only two dimensions of the plan
-- that can be measured from here. Egress and monthly active users cannot be,
-- and the checker says so on every run rather than leaving that as a gap.
--
-- storage.objects holds the file metadata Supabase bills file storage on; its
-- size lives in the metadata json rather than a column.
select
  pg_database_size(current_database()) as database_bytes,
  coalesce(sum((metadata ->> 'size')::bigint), 0) as storage_bytes
from storage.objects;
