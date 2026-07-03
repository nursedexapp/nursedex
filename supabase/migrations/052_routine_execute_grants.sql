-- ============================================================
-- Least-privilege EXECUTE grants on public-schema routines (issue #517)
-- ============================================================
-- Migration 044 tightened table-level Data API grants but left routines
-- alone: Postgres grants EXECUTE to PUBLIC by default on every new
-- function, so migration 042's `GRANT ALL ON ALL ROUTINES ... TO anon,
-- authenticated, service_role` was largely a no-op. This migration revokes
-- that PUBLIC default and re-grants EXECUTE only to the roles that
-- actually need it, in one of three ways:
--
--   1. Trigger-only functions (handle_updated_at, guard_users_protected_
--      columns, etc.) need no grant at all — triggers fire regardless of
--      the invoking role's EXECUTE privilege on the trigger function.
--   2. RLS-helper functions, called inside a policy's USING/WITH CHECK.
--      IMPORTANT: no CREATE POLICY in this codebase scopes itself with
--      `TO <role>`, so every policy applies to PUBLIC. is_admin() is
--      referenced by policies on tables anon also holds a grant on (e.g.
--      reviews_select_admin on public.reviews), and Postgres must be able
--      to evaluate every applicable OR'd permissive policy for the
--      querying role — so anon needs EXECUTE on is_admin() too, even
--      though it always evaluates false for anon. Narrowing this to
--      authenticated-only will break anon reads on those tables with
--      "permission denied for function" instead of the intended silent
--      false. get_user_role() is dead code (no policy or app code calls
--      it) and gets no re-grant.
--   3. App-facing RPCs, called via supabase.rpc() with the caller's own
--      JWT — granted to whichever role(s) actually call them.
--
-- service_role keeps EXECUTE on everything (trusted internal role, same
-- precedent as migration 044's table grants).
--
-- Migration 042 didn't just leave the PUBLIC default in place — it ran
-- `GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated,
-- service_role`, which is a role-specific ACL entry independent of PUBLIC.
-- Revoking only from PUBLIC below would leave that 042 grant fully intact
-- and be a no-op, so anon/authenticated must be revoked explicitly too.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ─── RLS-helper ───────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
-- get_user_role(): dead code, intentionally no re-grant.

-- ─── App-facing RPCs ──────────────────────────────────────────
-- Functions already carrying an explicit per-role GRANT EXECUTE from an
-- earlier migration (resolve_review_link, submit_external_review,
-- verify_external_review, dispute_review, request_review_removal,
-- increment_save_count_for_upsell, get_public_nurse_by_slug,
-- get_nurse_contact) keep working unchanged — those grants are additive
-- and unaffected by the PUBLIC revoke above. Only the three functions
-- below relied on the PUBLIC default with no explicit grant of their own.

GRANT EXECUTE ON FUNCTION public.calculate_distance(
  double precision, double precision, double precision, double precision
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_reveal_rate_limit(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.increment_nurse_analytics(uuid, text) TO authenticated;

-- ─── Default privileges for future functions ─────────────────
-- Future public functions default to no PUBLIC execute, so adding a new
-- one never silently re-opens this hole — anon/authenticated/service_role
-- access must be granted explicitly by whoever creates it.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
