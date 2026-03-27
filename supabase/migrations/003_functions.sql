-- ============================================================
-- Database Functions & Triggers
-- ============================================================

-- ─── Haversine distance (miles) ─────────────────────────────
-- Calculates distance between two lat/lng points.
-- Used for "X miles away" display and distance filtering.

CREATE OR REPLACE FUNCTION public.calculate_distance(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision AS $$
DECLARE
  r double precision := 3959; -- Earth radius in miles
  dlat double precision;
  dlon double precision;
  a double precision;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ^ 2;
  RETURN r * 2 * asin(sqrt(a));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── Check reveal rate limit ────────────────────────────────
-- Returns true if the family can reveal, false if rate-limited.

CREATE OR REPLACE FUNCTION public.check_reveal_rate_limit(
  p_family_user_id uuid
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  needs_captcha boolean
) AS $$
DECLARE
  v_count integer;
  v_captcha_threshold integer := 10;
  v_hard_cap integer := 25;
BEGIN
  SELECT COALESCE(rl.reveal_count, 0) INTO v_count
  FROM public.rate_limit_reveals rl
  WHERE rl.family_user_id = p_family_user_id
    AND rl.date = CURRENT_DATE;

  RETURN QUERY SELECT
    v_count < v_hard_cap,
    v_count,
    v_count >= v_captcha_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Increment nurse analytics ──────────────────────────────
-- Upserts a daily counter for profile views, saves, or reveals.

CREATE OR REPLACE FUNCTION public.increment_nurse_analytics(
  p_nurse_user_id uuid,
  p_field text -- 'profile_views', 'saves', or 'reveals'
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.nurse_analytics (nurse_user_id, date)
  VALUES (p_nurse_user_id, CURRENT_DATE)
  ON CONFLICT (nurse_user_id, date) DO NOTHING;

  IF p_field = 'profile_views' THEN
    UPDATE public.nurse_analytics
    SET profile_views = profile_views + 1
    WHERE nurse_user_id = p_nurse_user_id AND date = CURRENT_DATE;
  ELSIF p_field = 'saves' THEN
    UPDATE public.nurse_analytics
    SET saves = saves + 1
    WHERE nurse_user_id = p_nurse_user_id AND date = CURRENT_DATE;
  ELSIF p_field = 'reveals' THEN
    UPDATE public.nurse_analytics
    SET reveals = reveals + 1
    WHERE nurse_user_id = p_nurse_user_id AND date = CURRENT_DATE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Auto-create users row on signup ────────────────────────
-- When a new user signs up via Supabase Auth, automatically
-- create a row in public.users with their email.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Recalculate average rating ─────────────────────────────
-- After a review is inserted or updated, recalculate the nurse's
-- avg_rating and review_count from approved reviews only.

CREATE OR REPLACE FUNCTION public.recalculate_nurse_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.nurse_profiles
  SET
    avg_rating = sub.avg_rating,
    review_count = sub.review_count
  FROM (
    SELECT
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*) AS review_count
    FROM public.reviews
    WHERE nurse_user_id = COALESCE(NEW.nurse_user_id, OLD.nurse_user_id)
      AND status = 'approved'
  ) sub
  WHERE user_id = COALESCE(NEW.nurse_user_id, OLD.nurse_user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER recalc_rating_on_review
  AFTER INSERT OR UPDATE OF status, rating OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_nurse_rating();

-- ─── Re-verify on name change ───────────────────────────────
-- If a nurse changes their first or last name, reset their
-- verification status to pending.

CREATE OR REPLACE FUNCTION public.handle_name_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.first_name IS DISTINCT FROM NEW.first_name)
     OR (OLD.last_name IS DISTINCT FROM NEW.last_name) THEN
    UPDATE public.nurse_profiles
    SET verification_status = 'pending'
    WHERE user_id = NEW.id
      AND verification_status = 'verified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_name_change
  AFTER UPDATE OF first_name, last_name ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_name_change();
