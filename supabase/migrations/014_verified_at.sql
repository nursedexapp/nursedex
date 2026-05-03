-- ============================================================
-- Track verification timestamp (Phase 6 Batch 2)
-- ============================================================
-- Crons need to find nurses verified 2-4 weeks ago to trigger the
-- review invite email. updated_at on nurse_profiles is too noisy
-- (any profile edit moves it), so we record verified_at separately.
-- The verification approve action stamps this column server-side;
-- pre-existing verified rows backfill from updated_at to give the
-- crons a working start.

ALTER TABLE public.nurse_profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE public.nurse_profiles
SET verified_at = updated_at
WHERE verification_status = 'verified'
  AND verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_verified_at
  ON public.nurse_profiles (verified_at)
  WHERE verified_at IS NOT NULL;
