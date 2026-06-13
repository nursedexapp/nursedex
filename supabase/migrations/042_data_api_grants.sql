-- ============================================================
-- Explicit Data API GRANTs for the PostgREST roles
-- ============================================================
-- Supabase CLI v2.106.0 (2026-06-11) flipped [api].auto_expose_new_tables
-- to default false, so a fresh `supabase start` / `db reset` no longer
-- auto-grants Data API privileges on public schema objects. Without those
-- grants every PostgREST query fails with "permission denied for table ...",
-- regardless of RLS. The deprecated auto_expose escape hatch is removed on
-- 2026-10-30 and the same default is coming to hosted projects, so the
-- durable fix is to grant the privileges explicitly.
--
-- This restores exactly what auto_expose previously provided: ALL privileges
-- for anon, authenticated, and service_role on every public object. Row Level
-- Security (enabled on every table in 002_rls.sql and later migrations) stays
-- the real access control; these grants only make the objects reachable
-- through the Data API. The ALTER DEFAULT PRIVILEGES statements cover objects
-- created by future migrations so this cannot silently regress again.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
