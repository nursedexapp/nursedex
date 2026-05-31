-- Disputed reviews are meant to stay publicly visible (with an "Under
-- review" badge) and keep counting toward avg_rating while an admin
-- investigates. The public read policy only exposed status = 'approved',
-- so a disputed review silently disappeared from the public profile for
-- everyone except the nurse, the reviewer, and admins. getApprovedReviews
-- already queries status IN ('approved', 'disputed'); widen the policy to
-- match so public viewers actually see disputed reviews.

DROP POLICY IF EXISTS reviews_select_approved ON public.reviews;

CREATE POLICY reviews_select_approved ON public.reviews
  FOR SELECT USING (status IN ('approved', 'disputed'));
