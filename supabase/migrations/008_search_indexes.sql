-- ============================================================
-- Search indexes (Phase 3 Batch 2)
-- ============================================================
--
-- The base index idx_nurse_profiles_search covers the partial-btree
-- filter (verification_status, tier, is_available) WHERE verified.
--
-- These GIN indexes power the array-overlap filters used by the
-- /nurses search page: skills, languages, care_types, availability
-- commitment, and time slots.

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_skills_gin
  ON public.nurse_profiles USING GIN (skills);

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_languages_gin
  ON public.nurse_profiles USING GIN (languages);

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_care_types_gin
  ON public.nurse_profiles USING GIN (care_types);

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_availability_commitment_gin
  ON public.nurse_profiles USING GIN (availability_commitment);

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_time_slots_gin
  ON public.nurse_profiles USING GIN (time_slots);

-- Scalar filters used alongside the base index.
CREATE INDEX IF NOT EXISTS idx_nurse_profiles_credential
  ON public.nurse_profiles (credential);

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_gender
  ON public.nurse_profiles (gender) WHERE gender IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nurse_profiles_years_experience
  ON public.nurse_profiles (years_experience)
  WHERE years_experience IS NOT NULL;

-- Rate filter covers the common "nurse.rate_min <= user.rate_max" check.
CREATE INDEX IF NOT EXISTS idx_nurse_profiles_rate_min
  ON public.nurse_profiles (rate_min) WHERE rate_min IS NOT NULL;
