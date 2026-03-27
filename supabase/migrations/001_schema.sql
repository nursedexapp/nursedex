-- ============================================================
-- NurseDex Database Schema
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('nurse', 'family', 'admin', 'super_admin');
CREATE TYPE credential AS ENUM ('hha', 'cna', 'lpn', 'rn', 'np');
CREATE TYPE care_type AS ENUM (
  'elderly', 'pediatric', 'postpartum', 'disability',
  'post_surgical', 'chronic_illness', 'memory_care',
  'hospice', 'rehabilitation', 'wound_care'
);
CREATE TYPE skill AS ENUM (
  'medication_management', 'vital_signs', 'mobility_assistance',
  'bathing_hygiene', 'meal_preparation', 'light_housekeeping',
  'companionship', 'transportation', 'iv_therapy', 'catheter_care',
  'ventilator_care', 'diabetes_management', 'physical_therapy_support',
  'cpr_first_aid', 'dementia_care', 'tracheostomy_care', 'feeding_tube'
);
CREATE TYPE gender AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE nurse_tier AS ENUM ('free', 'featured');
CREATE TYPE availability_commitment AS ENUM ('full_time', 'part_time', 'per_diem', 'live_in');
CREATE TYPE time_slot AS ENUM ('weekdays', 'weekends', 'evenings', 'overnights', 'on_call', 'flexible');
CREATE TYPE communication_preference AS ENUM ('email', 'phone', 'text');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'expired');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected', 'disputed');
CREATE TYPE hire_status AS ENUM ('claimed', 'confirmed', 'rejected');
CREATE TYPE admin_action_type AS ENUM (
  'verify_nurse', 'reject_nurse', 'approve_review', 'reject_review',
  'resolve_dispute', 'suspend_user', 'unsuspend_user', 'remove_user'
);
CREATE TYPE subscription_plan AS ENUM ('nurse_featured', 'family_access');
CREATE TYPE unavailable_visibility AS ENUM ('hidden', 'badge');

-- ─── Tables ─────────────────────────────────────────────────

-- 1. Users (extends Supabase auth.users)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role user_role,
  first_name text,
  last_name text,
  phone text,
  zip_code text,
  communication_preference communication_preference,
  tos_accepted_at timestamptz,
  tos_version text,
  marketing_opt_out boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  is_suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Nurse Profiles
CREATE TABLE public.nurse_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  credential credential NOT NULL,
  license_number text,
  care_types care_type[] NOT NULL DEFAULT '{}',
  primary_care_type care_type,
  skills skill[] NOT NULL DEFAULT '{}',
  gender gender,
  years_experience integer CHECK (years_experience >= 0 AND years_experience <= 70),
  languages text[] NOT NULL DEFAULT '{English}',
  bio text,
  photos text[] NOT NULL DEFAULT '{}',
  rate_min numeric(6,2) CHECK (rate_min >= 0),
  rate_max numeric(6,2) CHECK (rate_max >= 0),
  has_transportation boolean NOT NULL DEFAULT false,
  covid_vaccinated boolean,
  care_philosophy text,
  additional_certs text[] NOT NULL DEFAULT '{}',
  availability_commitment availability_commitment[] NOT NULL DEFAULT '{}',
  time_slots time_slot[] NOT NULL DEFAULT '{}',
  travel_radius_miles integer CHECK (travel_radius_miles >= 0 AND travel_radius_miles <= 100),
  tier nurse_tier NOT NULL DEFAULT 'free',
  verification_status verification_status NOT NULL DEFAULT 'pending',
  verification_rejected_reason text,
  is_available boolean NOT NULL DEFAULT true,
  unavailable_visibility unavailable_visibility,
  profile_completeness integer NOT NULL DEFAULT 0 CHECK (profile_completeness >= 0 AND profile_completeness <= 100),
  avg_rating numeric(2,1),
  review_count integer NOT NULL DEFAULT 0,
  has_photo boolean NOT NULL DEFAULT false,
  is_seed boolean NOT NULL DEFAULT false,
  save_count_for_upsell integer NOT NULL DEFAULT 0,
  last_upsell_shown_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_range CHECK (rate_max IS NULL OR rate_min IS NULL OR rate_max >= rate_min)
);

-- 3. Family Profiles
CREATE TABLE public.family_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  zip_code text,
  communication_preference communication_preference,
  survey_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  status subscription_status NOT NULL DEFAULT 'active',
  plan_type subscription_plan NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  access_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Reveals
CREATE TABLE public.reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  access_expires_at timestamptz,
  UNIQUE (family_user_id, nurse_user_id)
);

-- 6. Saved Nurses
CREATE TABLE public.saved_nurses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_user_id, nurse_user_id)
);

-- 7. Hires
CREATE TABLE public.hires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status hire_status NOT NULL DEFAULT 'claimed',
  claimed_by text NOT NULL CHECK (claimed_by IN ('family', 'nurse')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  reviewer_email text,
  reviewer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text text,
  status review_status NOT NULL DEFAULT 'pending',
  is_external boolean NOT NULL DEFAULT false,
  external_token uuid,
  email_verified boolean NOT NULL DEFAULT false,
  testimonial_opt_in boolean NOT NULL DEFAULT false,
  nurse_response text,
  nurse_response_at timestamptz,
  dispute_reason text,
  dispute_text text,
  admin_decision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Admin Actions
CREATE TABLE public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_type admin_action_type NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Nurse Analytics (daily counters)
CREATE TABLE public.nurse_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  profile_views integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  reveals integer NOT NULL DEFAULT 0,
  UNIQUE (nurse_user_id, date)
);

-- 11. Email Log (deduplication)
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  dedup_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Rate Limit Reveals (daily tracking)
CREATE TABLE public.rate_limit_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  reveal_count integer NOT NULL DEFAULT 0,
  captcha_triggered boolean NOT NULL DEFAULT false,
  consecutive_captcha_days integer NOT NULL DEFAULT 0,
  UNIQUE (family_user_id, date)
);

-- 13. Zip Codes (Long Island lookup table)
CREATE TABLE public.zip_codes (
  zip text PRIMARY KEY,
  city text NOT NULL,
  county text NOT NULL,
  state text NOT NULL DEFAULT 'NY',
  latitude numeric(8,4) NOT NULL,
  longitude numeric(8,4) NOT NULL
);

-- 14. License Verification URLs
CREATE TABLE public.license_verification_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential credential NOT NULL,
  state text NOT NULL DEFAULT 'NY',
  url text NOT NULL,
  display_name text NOT NULL,
  UNIQUE (credential, state)
);

-- 15. Blocked Emails
CREATE TABLE public.blocked_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now()
);

-- 16. Contact Submissions
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 17. Search Gap Log
CREATE TABLE public.search_gap_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filters jsonb NOT NULL DEFAULT '{}',
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 18. Slug Redirects (for name changes)
CREATE TABLE public.slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_slug text NOT NULL UNIQUE,
  new_slug text NOT NULL,
  nurse_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Updated_at triggers ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.nurse_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.family_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
