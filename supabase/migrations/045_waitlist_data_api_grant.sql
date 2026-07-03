-- ============================================================
-- Restore the waitlist Data API grant missed by #387 (migration 044)
-- ============================================================
-- 044's table inventory was built by grepping migrations for
-- `CREATE TABLE public.<name>` (case-sensitive, schema-qualified). Migration
-- 006_waitlist.sql defines its table as `create table waitlist` — lowercase,
-- no `public.` prefix — so it never showed up and 044's blanket
-- `REVOKE ALL ... FROM anon, authenticated` silently dropped its INSERT
-- grant. The e2e regression test written for #354 (e2e/data-api.spec.ts)
-- caught it: "anon can INSERT into the waitlist" failed in CI.
--
-- The table's own RLS policy ("Anyone can sign up", `TO anon, authenticated
-- WITH CHECK (true)`) already scopes this correctly; only the grant was
-- missing.

GRANT INSERT ON public.waitlist TO anon, authenticated;
