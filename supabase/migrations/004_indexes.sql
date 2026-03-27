-- ============================================================
-- Indexes
-- ============================================================

-- Nurse profile search (the main search query)
CREATE INDEX idx_nurse_profiles_search ON public.nurse_profiles (
  verification_status, tier, is_available
) WHERE verification_status = 'verified';

-- Nurse profile by user_id (already covered by UNIQUE, but explicit)
-- Slug lookups
CREATE INDEX idx_nurse_profiles_slug ON public.nurse_profiles (slug);

-- Zip code lookups for distance calculation
CREATE INDEX idx_users_zip ON public.users (zip_code) WHERE zip_code IS NOT NULL;
CREATE INDEX idx_nurse_profiles_user_id ON public.nurse_profiles (user_id);

-- Reveals (family looking up their reveals, nurse seeing reveal count)
CREATE INDEX idx_reveals_family ON public.reveals (family_user_id);
CREATE INDEX idx_reveals_nurse ON public.reveals (nurse_user_id);

-- Saved nurses
CREATE INDEX idx_saved_nurses_family ON public.saved_nurses (family_user_id);

-- Reviews (looking up reviews for a nurse)
CREATE INDEX idx_reviews_nurse ON public.reviews (nurse_user_id, status);
CREATE INDEX idx_reviews_status ON public.reviews (status) WHERE status = 'pending';
CREATE INDEX idx_reviews_external_token ON public.reviews (external_token) WHERE external_token IS NOT NULL;

-- Email log (dedup lookups)
CREATE INDEX idx_email_log_dedup ON public.email_log (recipient_user_id, email_type, sent_at);
CREATE INDEX idx_email_log_dedup_key ON public.email_log (dedup_key);

-- Blocked emails (signup check)
CREATE INDEX idx_blocked_emails_email ON public.blocked_emails (email);

-- Hires
CREATE INDEX idx_hires_family ON public.hires (family_user_id);
CREATE INDEX idx_hires_nurse ON public.hires (nurse_user_id);

-- Rate limit reveals
CREATE INDEX idx_rate_limit_date ON public.rate_limit_reveals (family_user_id, date);

-- Nurse analytics (date range queries)
CREATE INDEX idx_nurse_analytics_date ON public.nurse_analytics (nurse_user_id, date);

-- Subscriptions
CREATE INDEX idx_subscriptions_user ON public.subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions (stripe_subscription_id);

-- Admin actions
CREATE INDEX idx_admin_actions_target ON public.admin_actions (target_user_id);

-- Slug redirects
CREATE INDEX idx_slug_redirects_old ON public.slug_redirects (old_slug);
