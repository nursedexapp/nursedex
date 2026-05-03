-- ============================================================
-- Save-driven Featured upsell
-- ============================================================
-- When a family saves a nurse, we bump nurse_profiles.save_count_for_upsell
-- via a SECURITY DEFINER RPC (RLS otherwise blocks a family from writing
-- to a nurse's row). The nurse's own profile-edit action then reads that
-- counter and the last_upsell_shown_at timestamp to decide whether to
-- surface a "Featured" upsell toast.

CREATE OR REPLACE FUNCTION public.increment_save_count_for_upsell(
  p_nurse_user_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE public.nurse_profiles
  SET save_count_for_upsell = save_count_for_upsell + 1
  WHERE user_id = p_nurse_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_save_count_for_upsell(uuid)
  TO authenticated;
