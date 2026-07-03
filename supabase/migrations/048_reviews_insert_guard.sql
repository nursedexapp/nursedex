-- ============================================================
-- reviews insert column guards (#389 follow-up)
-- ============================================================
-- reviews_insert only ever checked WITH CHECK (auth.uid() IS NOT NULL),
-- and migration 044 grants INSERT on every column to authenticated. Any
-- logged-in user could insert a review that starts already 'approved'
-- (skipping moderation entirely) and/or claims another user's
-- reviewer_user_id (impersonating a specific reviewer). The only real
-- authenticated-client insert path is submitFamilyReview in
-- src/lib/reviews/actions.ts, which always sets status='pending' and
-- reviewer_user_id=auth.uid(); external reviews
-- go through the submit_external_review SECURITY DEFINER RPC, which
-- always inserts reviewer_user_id=NULL and status='pending' too, so it
-- satisfies the same rule without needing a role-based exemption.

CREATE OR REPLACE FUNCTION public.guard_reviews_self_write()
RETURNS trigger AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dispute_transition boolean;
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New reviews must start pending' USING ERRCODE = '42501';
    END IF;

    IF (v_uid IS NOT NULL AND NEW.reviewer_user_id IS DISTINCT FROM v_uid)
       OR (v_uid IS NULL AND NEW.reviewer_user_id IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Cannot submit a review under another identity'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.admin_decision IS NOT NULL
       OR NEW.nurse_response IS NOT NULL
       OR NEW.nurse_response_at IS NOT NULL
       OR NEW.dispute_reason IS NOT NULL
       OR NEW.dispute_text IS NOT NULL
    THEN
      RAISE EXCEPTION 'Cannot set moderation or response fields on insert'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid = OLD.reviewer_user_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.nurse_user_id IS DISTINCT FROM OLD.nurse_user_id
       OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
       OR NEW.nurse_response IS DISTINCT FROM OLD.nurse_response
       OR NEW.nurse_response_at IS DISTINCT FROM OLD.nurse_response_at
       OR NEW.admin_decision IS DISTINCT FROM OLD.admin_decision
       OR NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason
       OR NEW.dispute_text IS DISTINCT FROM OLD.dispute_text
       OR NEW.is_external IS DISTINCT FROM OLD.is_external
       OR NEW.external_token IS DISTINCT FROM OLD.external_token
       OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
       OR NEW.verification_expires_at IS DISTINCT FROM OLD.verification_expires_at
       OR NEW.reviewer_name IS DISTINCT FROM OLD.reviewer_name
       OR NEW.reviewer_email IS DISTINCT FROM OLD.reviewer_email
    THEN
      RAISE EXCEPTION 'Reviewers may only edit rating, text, testimonial_opt_in, removal_requested, and removal_reason'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid = OLD.nurse_user_id THEN
    v_dispute_transition := OLD.status = 'approved' AND NEW.status = 'disputed';

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_dispute_transition THEN
      RAISE EXCEPTION 'Nurses may only move a review from approved to disputed'
        USING ERRCODE = '42501';
    END IF;

    IF (NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason
        OR NEW.dispute_text IS DISTINCT FROM OLD.dispute_text)
       AND NOT v_dispute_transition
    THEN
      RAISE EXCEPTION 'Nurses may only set dispute fields when disputing an approved review'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.text IS DISTINCT FROM OLD.text
       OR NEW.nurse_user_id IS DISTINCT FROM OLD.nurse_user_id
       OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
       OR NEW.reviewer_name IS DISTINCT FROM OLD.reviewer_name
       OR NEW.reviewer_email IS DISTINCT FROM OLD.reviewer_email
       OR NEW.admin_decision IS DISTINCT FROM OLD.admin_decision
       OR NEW.removal_requested IS DISTINCT FROM OLD.removal_requested
       OR NEW.removal_reason IS DISTINCT FROM OLD.removal_reason
       OR NEW.is_external IS DISTINCT FROM OLD.is_external
       OR NEW.external_token IS DISTINCT FROM OLD.external_token
       OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
       OR NEW.testimonial_opt_in IS DISTINCT FROM OLD.testimonial_opt_in
       OR NEW.verification_expires_at IS DISTINCT FROM OLD.verification_expires_at
    THEN
      RAISE EXCEPTION 'Nurses may only edit their response or dispute an approved review'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_reviews_self_write ON public.reviews;
CREATE TRIGGER guard_reviews_self_write
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviews_self_write();
