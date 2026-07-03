-- ============================================================
-- RLS write-policy hardening (issues #384-389)
-- ============================================================
-- Migration 042 restored explicit Data API GRANTs (ALL privileges to
-- anon/authenticated), which made several owner-scoped write policies
-- directly exploitable since they only ever had a USING clause (no
-- WITH CHECK): a plain authenticated JWT could self-grant super_admin,
-- self-verify or self-feature a nurse profile, or bypass the Family
-- Access paywall entirely via a direct PostgREST write. This migration
-- closes those gaps.
--
-- Column-level guards are implemented as BEFORE INSERT/UPDATE triggers
-- rather than per-policy WITH CHECK clauses: a trigger can compare NEW
-- against OLD (WITH CHECK only ever sees NEW), and a single trigger per
-- table is easier to audit than several overlapping permissive policies.
-- Every guard exempts `service_role` (webhooks, crons) and `is_admin()`
-- (the existing admin RLS policies), matching how those write paths
-- already operate today.

-- ─── users: block self-escalation (#384) ────────────────────
-- public.users has no is_seed column (seed accounts are identified by
-- email pattern instead, see src/lib/admin/seed.ts); only role,
-- is_suspended, and is_deleted need guarding here.

CREATE OR REPLACE FUNCTION public.guard_users_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
  THEN
    RAISE EXCEPTION 'Cannot modify role, is_suspended, or is_deleted'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_users_protected_columns ON public.users;
CREATE TRIGGER guard_users_protected_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_protected_columns();

-- ─── users: anon/authenticated cannot INSERT (#388) ─────────
-- users_insert_service exists for the on_auth_user_created trigger, which
-- runs as a SECURITY DEFINER function owned by a superuser and so never
-- goes through the Data API grant/policy layer at all. Restricting the
-- policy role and revoking the Data API grant doesn't affect it.

DROP POLICY IF EXISTS users_insert_service ON public.users;
CREATE POLICY users_insert_service ON public.users
  FOR INSERT TO service_role WITH CHECK (true);

REVOKE INSERT ON public.users FROM anon, authenticated;

-- ─── nurse_profiles: block self-verify / self-feature (#386) ─

CREATE OR REPLACE FUNCTION public.guard_nurse_profiles_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status IS DISTINCT FROM 'pending'
       OR NEW.tier IS DISTINCT FROM 'free'
       OR NEW.is_hidden IS DISTINCT FROM false
       OR NEW.is_seed IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION 'Cannot self-set verification_status, tier, is_hidden, or is_seed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
     OR NEW.is_seed IS DISTINCT FROM OLD.is_seed
  THEN
    RAISE EXCEPTION 'Cannot modify verification_status, tier, is_hidden, or is_seed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_nurse_profiles_protected_columns ON public.nurse_profiles;
CREATE TRIGGER guard_nurse_profiles_protected_columns
  BEFORE INSERT OR UPDATE ON public.nurse_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_nurse_profiles_protected_columns();

-- ─── reveals: require an active paywall subscription (#385) ─
-- Also pins access_expires_at to NULL on insert so a caller cannot grant
-- themselves indefinite access; the app sets it later via the
-- cancellation grace-period flow (service role).

DROP POLICY IF EXISTS reveals_insert_family ON public.reveals;
CREATE POLICY reveals_insert_family ON public.reveals
  FOR INSERT WITH CHECK (
    family_user_id = auth.uid()
    AND access_expires_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan_type = 'family_access'
        AND s.status IN ('active', 'past_due')
    )
  );

-- ─── reviews: pin moderation/ownership columns (#389) ───────
-- Reviewers may edit rating/text/testimonial_opt_in while pending (already
-- enforced by reviews_update_reviewer's USING-as-WITH-CHECK) and may flag
-- their own approved review for removal (request_review_removal). Nurses
-- may edit their own response, and may move an approved review to
-- disputed together with the dispute fields (dispute_review). Every other
-- column is pinned for both identities.

CREATE OR REPLACE FUNCTION public.guard_reviews_self_write()
RETURNS trigger AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dispute_transition boolean;
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
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
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviews_self_write();
