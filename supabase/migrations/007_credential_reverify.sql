-- ============================================================
-- Re-verify on credential change
-- ============================================================
-- If a nurse changes their credential type and they were
-- previously verified, reset their verification status to pending.
-- Complements the existing name-change trigger on the users table.

CREATE OR REPLACE FUNCTION public.handle_credential_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.credential IS DISTINCT FROM NEW.credential) THEN
    NEW.verification_status := 'pending';
    NEW.verification_rejected_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_credential_change
  BEFORE UPDATE OF credential ON public.nurse_profiles
  FOR EACH ROW
  WHEN (OLD.verification_status = 'verified')
  EXECUTE FUNCTION public.handle_credential_change();
