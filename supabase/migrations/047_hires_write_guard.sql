-- ============================================================
-- hires self-write column guards (#389 follow-up)
-- ============================================================
-- hires_update_family and hires_update_nurse only ever had a USING clause
-- keyed on family_user_id/nurse_user_id. Postgres reuses that as the
-- implicit WITH CHECK, so a party can't reassign themselves off a row, but
-- every other column (status, confirmed_at, the OTHER party's user_id,
-- claimed_by, claim_token) was wide open. A nurse could self-confirm any
-- hire touching them, and a family could rewrite nurse_user_id to pin a
-- fabricated hire on an arbitrary nurse. The same gap existed on INSERT:
-- hires_insert_family/hires_insert_nurse only checked which party the row
-- named, not the row's shape, so a nurse could insert a hire already
-- 'confirmed' with no family action at all, and a family could record a
-- hire against a nurse they never revealed. No app code writes to hires as
-- an authenticated nurse at all (claimHireByEmail's insert and its
-- claim_token refresh both run as service_role); the only
-- authenticated-client writes are the family's recordFamilyHire insert and
-- confirm/reject of a nurse-initiated claim in src/lib/hires/actions.ts.

CREATE OR REPLACE FUNCTION public.guard_hires_self_write()
RETURNS trigger AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_confirm_transition boolean;
  v_reject_transition boolean;
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL OR v_uid != NEW.family_user_id THEN
      RAISE EXCEPTION 'Only a family can directly insert a hire' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM 'confirmed'
       OR NEW.claimed_by IS DISTINCT FROM 'family'
       OR NEW.confirmed_at IS NULL
       OR NEW.claim_token IS NOT NULL
    THEN
      RAISE EXCEPTION 'A family can only insert a hire as an already-confirmed record they made themselves'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.reveals r
      WHERE r.family_user_id = NEW.family_user_id AND r.nurse_user_id = NEW.nurse_user_id
    ) THEN
      RAISE EXCEPTION 'Cannot record a hire for a nurse you have not revealed'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid = OLD.family_user_id THEN
    v_confirm_transition := OLD.status = 'claimed' AND OLD.claimed_by = 'nurse'
      AND NEW.status = 'confirmed';
    v_reject_transition := OLD.status = 'claimed' AND OLD.claimed_by = 'nurse'
      AND NEW.status = 'rejected';

    IF NEW.family_user_id IS DISTINCT FROM OLD.family_user_id
       OR NEW.nurse_user_id IS DISTINCT FROM OLD.nurse_user_id
       OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
       OR NEW.claim_token IS DISTINCT FROM OLD.claim_token
    THEN
      RAISE EXCEPTION 'Cannot modify family_user_id, nurse_user_id, claimed_by, or claim_token'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (v_confirm_transition OR v_reject_transition)
    THEN
      RAISE EXCEPTION 'A family may only confirm or reject a nurse-initiated claimed hire'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at AND NOT v_confirm_transition THEN
      RAISE EXCEPTION 'confirmed_at may only be set when confirming a claimed hire'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid = OLD.nurse_user_id THEN
    RAISE EXCEPTION 'Nurses cannot directly modify hires' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_hires_self_write ON public.hires;
CREATE TRIGGER guard_hires_self_write
  BEFORE INSERT OR UPDATE ON public.hires
  FOR EACH ROW EXECUTE FUNCTION public.guard_hires_self_write();
