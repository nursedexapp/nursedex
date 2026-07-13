-- ============================================================
-- Restore the EXECUTE grants migration 052 revoked by accident (#700)
-- ============================================================
-- Migration 052 (least-privilege routine grants, #517) did this:
--
--   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
--     FROM PUBLIC, anon, authenticated;
--
-- and re-granted three functions. Its comment reasoned that functions
-- already carrying an explicit per-role grant from an earlier migration
-- (get_nurse_contact, dispute_review, ...) "keep working unchanged, those
-- grants are additive and unaffected by the PUBLIC revoke above."
--
-- That is false. The statement does not only revoke the PUBLIC default: it
-- names anon and authenticated too (it had to, to undo migration 042's
-- blanket GRANT ALL). REVOKE ... FROM authenticated removes the grant TO
-- authenticated no matter which migration wrote it, so the explicit grants
-- from migrations 009-015 were revoked along with the default, and six
-- app-facing RPCs were left callable only by service_role.
--
-- Every one of them is called with the USER's client, so each has been
-- failing in production with "permission denied for function" (42501) since
-- 052 shipped. get_public_nurse_by_slug survived only by luck: migration 057
-- re-granted it for an unrelated reason, which is why nurse profiles still
-- render and this went unnoticed.
--
-- The one that cost money is get_nurse_contact. revealNurse spends one of a
-- family's capped daily reveals and writes the reveal, THEN reads the contact
-- back through this function with the family's own session. The spend
-- succeeded and the read was denied, so a family who clicked "Reveal contact
-- info" was charged a reveal and shown an empty Contact Information card.
-- Both halves were tested in isolation and passed; the e2e reveal in #700 is
-- what put them together and caught it.
--
-- This restores exactly the grants those migrations declared, no wider:
--
--   009  increment_save_count_for_upsell  authenticated
--   010  request_review_removal           authenticated
--   012  dispute_review                   authenticated
--   015  get_nurse_contact                authenticated
--   011  submit_external_review           anon, authenticated
--   011  verify_external_review           anon, authenticated  (re-cut in 019)
--
-- resolve_review_link (011: anon, authenticated) is deliberately NOT restored.
-- Nothing calls it any more, so it stays revoked rather than re-opening a
-- function with no caller.
--
-- anon is required for the external-review pair on purpose: an external
-- reviewer follows an emailed link and is not logged in. Both functions are
-- SECURITY DEFINER and gate on the link token itself, so the grant exposes
-- nothing that the token does not already authorise.
--
-- Guarded by src/lib/__tests__/routine-execute-grants.test.ts, which now
-- calls every app-facing RPC as the role that calls it in production and
-- fails on a permission error. That suite previously only asserted the
-- grants 052 re-granted, which is exactly how a migration that broke six
-- functions shipped green.

-- ─── authenticated-only ───────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.increment_save_count_for_upsell(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.request_review_removal(uuid, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.dispute_review(uuid, text, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_nurse_contact(uuid)
  TO authenticated;

-- ─── anon + authenticated (logged-out external reviewer) ──────

GRANT EXECUTE ON FUNCTION public.submit_external_review(
  uuid, text, text, int, text, boolean, timestamptz
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_external_review(uuid)
  TO anon, authenticated;
