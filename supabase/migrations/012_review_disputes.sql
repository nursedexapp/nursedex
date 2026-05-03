-- ============================================================
-- Review disputes (Phase 5 Batch 4)
-- ============================================================
-- Nurses can dispute an approved review. The status flips to
-- 'disputed' (kept publicly visible during investigation per the
-- PRD), and dispute_reason / dispute_text are saved for the admin
-- queue. The rating recalc trigger is widened so disputed reviews
-- continue to count toward avg_rating during investigation; a
-- nurse who disputes every bad review gets no temporary benefit
-- from the dispute, only an admin decision can change the rating.

CREATE OR REPLACE FUNCTION public.dispute_review(
  p_review_id uuid,
  p_reason text,
  p_text text
)
RETURNS void AS $$
BEGIN
  UPDATE public.reviews
  SET
    status = 'disputed',
    dispute_reason = p_reason,
    dispute_text = p_text
  WHERE id = p_review_id
    AND nurse_user_id = auth.uid()
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found, not yours, or not currently approved'
      USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.dispute_review(uuid, text, text)
  TO authenticated;

-- Replace the recalc trigger function so disputed reviews count
-- toward avg_rating + review_count just like approved ones. The
-- existing trigger registration in 003_functions.sql still binds
-- to this function name, so no DROP/RECREATE needed.
CREATE OR REPLACE FUNCTION public.recalculate_nurse_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.nurse_profiles
  SET
    avg_rating = sub.avg_rating,
    review_count = sub.review_count
  FROM (
    SELECT
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*) AS review_count
    FROM public.reviews
    WHERE nurse_user_id = COALESCE(NEW.nurse_user_id, OLD.nurse_user_id)
      AND status IN ('approved', 'disputed')
  ) sub
  WHERE user_id = COALESCE(NEW.nurse_user_id, OLD.nurse_user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
