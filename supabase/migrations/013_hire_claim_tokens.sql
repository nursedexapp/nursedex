-- ============================================================
-- Hire claim tokens (Phase 6 Batch 1)
-- ============================================================
-- When a nurse claims a hire, we mint a one-time UUID token. The
-- token is sent to the family's email; clicking it lands them on
-- /hires/confirm/[token] where they can confirm or reject. Tokens
-- only exist on rows where claimed_by='nurse' AND status='claimed';
-- once the row is confirmed or rejected, the token can be cleared
-- so it can't be replayed.

ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hires_claim_token
  ON public.hires (claim_token)
  WHERE claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hires_family_user_id
  ON public.hires (family_user_id);

CREATE INDEX IF NOT EXISTS idx_hires_nurse_user_id
  ON public.hires (nurse_user_id);
