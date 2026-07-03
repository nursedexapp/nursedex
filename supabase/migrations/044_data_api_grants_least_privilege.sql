-- ============================================================
-- Least-privilege Data API GRANTs (issue #387)
-- ============================================================
-- Migration 042 restored the Data API's ability to reach every public
-- table after Supabase CLI v2.106.0 stopped auto-exposing them, but did so
-- with GRANT ALL to anon and authenticated on every table plus a matching
-- ALTER DEFAULT PRIVILEGES for future tables. That made RLS the *sole*
-- guard against a bad write: any RLS gap (missing WITH CHECK, a policy
-- that's broader than intended, a table with no policies at all) became an
-- immediate read or write breach with no second layer of defense. It also
-- meant at least one table (newsletter_subscribers) had a real permissive
-- INSERT policy that was reachable by anon even though the app never uses
-- that path.
--
-- This migration replaces the blanket grant with explicit, per-table,
-- per-operation grants scoped to what the app actually does through the
-- Data API using the caller's own JWT (not the service-role key). Tables
-- the app only ever touches with a service-role client get no anon/
-- authenticated grant at all, even where a permissive RLS policy exists for
-- them (that policy becomes unreachable and, where it served no purpose,
-- is dropped below) — RLS stays defense in depth, not the only line.
--
-- service_role keeps ALL on everything: it's a trusted internal role,
-- typically driven by service code that has already done its own
-- authorization checks, and Postgres GRANT/REVOKE governs it independently
-- of RLS bypass.
--
-- Out of scope: EXECUTE grants on ROUTINES. Several RLS policies call
-- helper functions like is_admin() as part of their USING/WITH CHECK
-- expressions, and Postgres grants EXECUTE to PUBLIC by default on new
-- functions, so tightening that safely requires auditing and re-granting
-- every function individually — a mistake there breaks RLS evaluation
-- everywhere, not just one table. Tracked as a separate follow-up.

-- ─── Reset: start from nothing for anon/authenticated ───────

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ─── Per-table grants ────────────────────────────────────────
-- service_role already has ALL from migration 042; unchanged here.

-- admin_actions: admins write their own audit-log rows through their own
-- session (account-actions.ts); nothing reads it via a user JWT today.
GRANT INSERT ON public.admin_actions TO authenticated;

-- blog_posts: the admin blog dashboard runs full CRUD through the
-- authenticated session, gated by is_admin() RLS policies (actions.ts,
-- queries.ts). Public listings/detail pages always read through
-- service-role instead, so anon gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- contact_submissions: the public contact form inserts as anon or
-- authenticated depending on whether the visitor is signed in.
GRANT INSERT ON public.contact_submissions TO anon, authenticated;

-- family_profiles: family role-selection/onboarding and profile edits run
-- on the user's own row through the authenticated session.
GRANT SELECT, INSERT, UPDATE ON public.family_profiles TO authenticated;

-- hires: family + nurse own-row flows read/write through the authenticated
-- session (claim, confirm, status updates).
GRANT SELECT, INSERT, UPDATE ON public.hires TO authenticated;

-- license_verification_urls: public reference data shown on nurse profile
-- pages to both signed-out visitors and signed-in users.
GRANT SELECT ON public.license_verification_urls TO anon, authenticated;

-- nurse_analytics: a nurse reads their own dashboard stats through the
-- authenticated session; all writes go through the increment_nurse_analytics
-- SECURITY DEFINER function, not direct table writes.
GRANT SELECT ON public.nurse_analytics TO authenticated;

-- nurse_profiles: verified/non-hidden profiles are public (search, profile
-- pages); a nurse reads/edits their own row and sets it once on signup
-- through the authenticated session. verification_status/tier/is_hidden/
-- is_seed stay guarded by the migration-043 trigger regardless of grant.
GRANT SELECT ON public.nurse_profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.nurse_profiles TO authenticated;

-- nurse_review_links: a nurse generates and reads their own external-review
-- link through the authenticated session; regeneration/rotation always
-- goes through service-role, so authenticated gets no UPDATE/DELETE.
GRANT SELECT, INSERT ON public.nurse_review_links TO authenticated;

-- rate_limit_reveals: a family reads their own rate-limit counter through
-- the authenticated session; all writes go through service-role.
GRANT SELECT ON public.rate_limit_reveals TO authenticated;

-- reveals: a family/nurse reads their own reveal rows, and a family inserts
-- a reveal through the authenticated session (migration-043-hardened
-- reveals_insert_family requires an active subscription). No UPDATE/DELETE
-- policy exists; access_expires_at is only ever moved by service-role.
GRANT SELECT, INSERT ON public.reveals TO authenticated;

-- reviews: approved/disputed reviews are public; reviewers, nurses, and
-- admins all write through their own authenticated session (admin
-- approve/reject/dispute actions run as the admin's own JWT, gated by
-- is_admin() RLS plus the migration-043 guard_reviews_self_write trigger).
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;

-- saved_nurses: a family reads/adds/removes their own saved nurses through
-- the authenticated session. No UPDATE policy exists (rows are add/remove
-- only).
GRANT SELECT, INSERT, DELETE ON public.saved_nurses TO authenticated;

-- search_gap_log: the public search/survey-results pages log a gap as
-- anon or authenticated depending on sign-in state; no read policy for
-- either role.
GRANT INSERT ON public.search_gap_log TO anon, authenticated;

-- slug_redirects: public old-URL redirect resolution reads this as anon or
-- authenticated; all writes go through service-role.
GRANT SELECT ON public.slug_redirects TO anon, authenticated;

-- subscriptions: a user reads their own subscription row through the
-- authenticated session; every write (Stripe webhooks, crons, even admin
-- overrides) goes through service-role. No INSERT/UPDATE/DELETE policy
-- exists at all, so this is defense in depth against a future permissive
-- policy, matching the pattern already applied to users in migration 043.
GRANT SELECT ON public.subscriptions TO authenticated;

-- users: a user reads/edits their own row through the authenticated
-- session. INSERT stays service_role-only, already revoked from anon/
-- authenticated by migration 043 — not re-granted here.
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- zip_codes: public reference data used for distance calculations on
-- public search results and the authenticated dashboard.
GRANT SELECT ON public.zip_codes TO anon, authenticated;

-- ─── Tables with no anon/authenticated Data API access ───────
-- Everything else — admin-only or internal tables the app only ever
-- touches with a service-role client — gets no grant at all:
-- blocked_emails, blog_categories, blog_comments, blog_post_revisions,
-- blog_post_tags, blog_slug_redirects, blog_tags, blog_taxonomy_redirects,
-- consulting_requests, consulting_time_entries, email_log,
-- newsletter_subscribers.

-- ─── Drop now-unreachable policies ────────────────────────────
-- These tables get zero anon/authenticated grant above, so any policy on
-- them is unreachable through the Data API regardless of what it allows
-- (service_role bypasses RLS and doesn't need a policy at all). Dropping
-- them avoids leaving permissive-looking policies that no longer mean
-- anything, matching the zero-policy pattern already used for
-- consulting_requests/consulting_time_entries.

DROP POLICY IF EXISTS blocked_emails_select_admin ON public.blocked_emails;
DROP POLICY IF EXISTS blocked_emails_insert_admin ON public.blocked_emails;

DROP POLICY IF EXISTS blog_categories_select_all ON public.blog_categories;
DROP POLICY IF EXISTS blog_categories_admin ON public.blog_categories;

DROP POLICY IF EXISTS blog_comments_admin ON public.blog_comments;

DROP POLICY IF EXISTS blog_post_revisions_admin ON public.blog_post_revisions;

DROP POLICY IF EXISTS blog_post_tags_select_all ON public.blog_post_tags;
DROP POLICY IF EXISTS blog_post_tags_admin ON public.blog_post_tags;

DROP POLICY IF EXISTS blog_slug_redirects_select_all ON public.blog_slug_redirects;
DROP POLICY IF EXISTS blog_slug_redirects_admin ON public.blog_slug_redirects;

DROP POLICY IF EXISTS blog_tags_select_all ON public.blog_tags;
DROP POLICY IF EXISTS blog_tags_admin ON public.blog_tags;

DROP POLICY IF EXISTS email_log_select_admin ON public.email_log;

DROP POLICY IF EXISTS newsletter_insert_anon ON public.newsletter_subscribers;
DROP POLICY IF EXISTS newsletter_select_admin ON public.newsletter_subscribers;

-- ─── Default privileges for future tables/sequences ───────────
-- Future public tables/sequences default to service_role only, so adding
-- a new table never silently re-opens this hole — anon/authenticated
-- access must be granted explicitly by whoever creates it. Routines are
-- intentionally left unchanged (see header note).

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
