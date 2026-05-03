-- ============================================================
-- Reviews: removal request + duplicate-prevention (Phase 5 Batch 1)
-- ============================================================
-- 1) Two new columns let a family flag an approved review for admin
--    removal without deleting the row outright.
-- 2) Partial unique index prevents a family from submitting more than
--    one platform (non-external) review per nurse. External reviews
--    can come from many distinct visitors, so they are excluded.
-- 3) SECURITY DEFINER RPC handles the removal-request update because
--    the existing RLS policy only allows reviewer-side updates while
--    the review is still pending; a removal request happens after the
--    review has been approved.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS removal_requested boolean NOT NULL DEFAULT false;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS removal_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_review_per_family_nurse
  ON public.reviews (reviewer_user_id, nurse_user_id)
  WHERE is_external = false AND reviewer_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_review_removal(
  p_review_id uuid,
  p_reason text
)
RETURNS void AS $$
BEGIN
  UPDATE public.reviews
  SET
    removal_requested = true,
    removal_reason = p_reason
  WHERE id = p_review_id
    AND reviewer_user_id = auth.uid()
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found, not yours, or not eligible for removal'
      USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_review_removal(uuid, text)
  TO authenticated;
