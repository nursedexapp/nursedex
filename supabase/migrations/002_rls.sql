-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurse_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_nurses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurse_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zip_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_verification_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_gap_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slug_redirects ENABLE ROW LEVEL SECURITY;

-- ─── Helper function: get current user's role ───────────────

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT role IN ('admin', 'super_admin') FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Users ──────────────────────────────────────────────────

-- Users can read their own row
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (id = auth.uid());

-- Users can update their own row
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Admins can read all users
CREATE POLICY users_select_admin ON public.users
  FOR SELECT USING (public.is_admin());

-- Admins can update any user
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE USING (public.is_admin());

-- Service role can insert (for auto-create trigger)
CREATE POLICY users_insert_service ON public.users
  FOR INSERT WITH CHECK (true);

-- ─── Nurse Profiles ─────────────────────────────────────────

-- Nurses can read and update their own profile
CREATE POLICY nurse_profiles_select_own ON public.nurse_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY nurse_profiles_update_own ON public.nurse_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY nurse_profiles_insert_own ON public.nurse_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Authenticated users can read verified, non-deleted, non-suspended nurse profiles
CREATE POLICY nurse_profiles_select_public ON public.nurse_profiles
  FOR SELECT USING (
    verification_status = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nurse_profiles.user_id
      AND (u.is_deleted = true OR u.is_suspended = true)
    )
  );

-- Admins can read and update all nurse profiles
CREATE POLICY nurse_profiles_select_admin ON public.nurse_profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY nurse_profiles_update_admin ON public.nurse_profiles
  FOR UPDATE USING (public.is_admin());

-- ─── Family Profiles ────────────────────────────────────────

-- Families can CRUD their own profile
CREATE POLICY family_profiles_select_own ON public.family_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY family_profiles_update_own ON public.family_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY family_profiles_insert_own ON public.family_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins can read all family profiles
CREATE POLICY family_profiles_select_admin ON public.family_profiles
  FOR SELECT USING (public.is_admin());

-- ─── Subscriptions ──────────────────────────────────────────

-- Users can read their own subscriptions
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all subscriptions
CREATE POLICY subscriptions_select_admin ON public.subscriptions
  FOR SELECT USING (public.is_admin());

-- Only service role manages subscriptions (via Stripe webhooks)

-- ─── Reveals ────────────────────────────────────────────────

-- Families can read their own reveals
CREATE POLICY reveals_select_family ON public.reveals
  FOR SELECT USING (family_user_id = auth.uid());

-- Nurses can see they were revealed (but not who)
CREATE POLICY reveals_select_nurse ON public.reveals
  FOR SELECT USING (nurse_user_id = auth.uid());

-- Admins can read all reveals
CREATE POLICY reveals_select_admin ON public.reveals
  FOR SELECT USING (public.is_admin());

-- Families can insert reveals (app validates subscription)
CREATE POLICY reveals_insert_family ON public.reveals
  FOR INSERT WITH CHECK (family_user_id = auth.uid());

-- ─── Saved Nurses ───────────────────────────────────────────

-- Families can manage their own saves
CREATE POLICY saved_nurses_select_own ON public.saved_nurses
  FOR SELECT USING (family_user_id = auth.uid());

CREATE POLICY saved_nurses_insert_own ON public.saved_nurses
  FOR INSERT WITH CHECK (family_user_id = auth.uid());

CREATE POLICY saved_nurses_delete_own ON public.saved_nurses
  FOR DELETE USING (family_user_id = auth.uid());

-- Admins can read all saves
CREATE POLICY saved_nurses_select_admin ON public.saved_nurses
  FOR SELECT USING (public.is_admin());

-- ─── Hires ──────────────────────────────────────────────────

-- Families can read and insert their own hires
CREATE POLICY hires_select_family ON public.hires
  FOR SELECT USING (family_user_id = auth.uid());

CREATE POLICY hires_insert_family ON public.hires
  FOR INSERT WITH CHECK (family_user_id = auth.uid());

-- Nurses can read hires involving them
CREATE POLICY hires_select_nurse ON public.hires
  FOR SELECT USING (nurse_user_id = auth.uid());

-- Nurses can insert hire claims
CREATE POLICY hires_insert_nurse ON public.hires
  FOR INSERT WITH CHECK (nurse_user_id = auth.uid());

-- Both can update (for confirmation flow)
CREATE POLICY hires_update_family ON public.hires
  FOR UPDATE USING (family_user_id = auth.uid());

CREATE POLICY hires_update_nurse ON public.hires
  FOR UPDATE USING (nurse_user_id = auth.uid());

-- Admins can read all hires
CREATE POLICY hires_select_admin ON public.hires
  FOR SELECT USING (public.is_admin());

-- ─── Reviews ────────────────────────────────────────────────

-- Anyone can read approved reviews
CREATE POLICY reviews_select_approved ON public.reviews
  FOR SELECT USING (status = 'approved');

-- Nurses can read all reviews about them (including pending)
CREATE POLICY reviews_select_nurse ON public.reviews
  FOR SELECT USING (nurse_user_id = auth.uid());

-- Reviewers can read their own reviews
CREATE POLICY reviews_select_reviewer ON public.reviews
  FOR SELECT USING (reviewer_user_id = auth.uid());

-- Authenticated users can insert reviews
CREATE POLICY reviews_insert ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Reviewers can update their pending reviews
CREATE POLICY reviews_update_reviewer ON public.reviews
  FOR UPDATE USING (
    reviewer_user_id = auth.uid()
    AND status = 'pending'
  );

-- Nurses can update nurse_response on their reviews
CREATE POLICY reviews_update_nurse_response ON public.reviews
  FOR UPDATE USING (nurse_user_id = auth.uid());

-- Admins can read and update all reviews
CREATE POLICY reviews_select_admin ON public.reviews
  FOR SELECT USING (public.is_admin());

CREATE POLICY reviews_update_admin ON public.reviews
  FOR UPDATE USING (public.is_admin());

-- ─── Admin Actions ──────────────────────────────────────────

-- Only admins can read and insert
CREATE POLICY admin_actions_select ON public.admin_actions
  FOR SELECT USING (public.is_admin());

CREATE POLICY admin_actions_insert ON public.admin_actions
  FOR INSERT WITH CHECK (public.is_admin());

-- ─── Nurse Analytics ────────────────────────────────────────

-- Nurses can read their own analytics
CREATE POLICY nurse_analytics_select_own ON public.nurse_analytics
  FOR SELECT USING (nurse_user_id = auth.uid());

-- Admins can read all analytics
CREATE POLICY nurse_analytics_select_admin ON public.nurse_analytics
  FOR SELECT USING (public.is_admin());

-- ─── Email Log ──────────────────────────────────────────────

-- Only service role and admins
CREATE POLICY email_log_select_admin ON public.email_log
  FOR SELECT USING (public.is_admin());

-- ─── Rate Limit Reveals ─────────────────────────────────────

-- Families can read their own rate limits
CREATE POLICY rate_limit_reveals_select_own ON public.rate_limit_reveals
  FOR SELECT USING (family_user_id = auth.uid());

-- Admins can read all
CREATE POLICY rate_limit_reveals_select_admin ON public.rate_limit_reveals
  FOR SELECT USING (public.is_admin());

-- ─── Zip Codes (public read) ────────────────────────────────

CREATE POLICY zip_codes_select_all ON public.zip_codes
  FOR SELECT USING (true);

-- ─── License Verification URLs (public read) ────────────────

CREATE POLICY license_urls_select_all ON public.license_verification_urls
  FOR SELECT USING (true);

-- ─── Blocked Emails ─────────────────────────────────────────

-- Only admins and service role
CREATE POLICY blocked_emails_select_admin ON public.blocked_emails
  FOR SELECT USING (public.is_admin());

CREATE POLICY blocked_emails_insert_admin ON public.blocked_emails
  FOR INSERT WITH CHECK (public.is_admin());

-- ─── Contact Submissions ────────────────────────────────────

-- Anyone can insert (public form)
CREATE POLICY contact_insert ON public.contact_submissions
  FOR INSERT WITH CHECK (true);

-- Only admins can read and update
CREATE POLICY contact_select_admin ON public.contact_submissions
  FOR SELECT USING (public.is_admin());

CREATE POLICY contact_update_admin ON public.contact_submissions
  FOR UPDATE USING (public.is_admin());

-- ─── Search Gap Log ─────────────────────────────────────────

-- Anyone can insert (logged on search)
CREATE POLICY search_gap_insert ON public.search_gap_log
  FOR INSERT WITH CHECK (true);

-- Only admins can read
CREATE POLICY search_gap_select_admin ON public.search_gap_log
  FOR SELECT USING (public.is_admin());

-- ─── Slug Redirects (public read) ───────────────────────────

CREATE POLICY slug_redirects_select_all ON public.slug_redirects
  FOR SELECT USING (true);
