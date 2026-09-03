-- ============================================================
-- Where a nurse's face is in her photo (#768)
-- ============================================================
--
-- The directory card crops her photo to a small circle. The crop is anchored
-- at the upper third, which is where faces sit in most photos and gets the
-- majority right for free, but it cannot get all of them right: a number of
-- the real photos on the roster are group shots or off centre, and a circle
-- cropped from a fixed point cuts heads off.
--
-- Two percentages, so the ORIGINAL photo is kept as it is and the same focal
-- point can drive any future crop shape. Re-encoding the image instead would
-- throw away everything outside whatever shape we happened to want today.
--
-- The defaults are exactly the heuristic the card already uses, so every
-- existing photo keeps looking precisely as it does now and only a nurse who
-- deliberately moves hers changes anything.

ALTER TABLE public.nurse_profiles
  ADD COLUMN IF NOT EXISTS photo_focal_x smallint NOT NULL DEFAULT 50
    CHECK (photo_focal_x >= 0 AND photo_focal_x <= 100),
  ADD COLUMN IF NOT EXISTS photo_focal_y smallint NOT NULL DEFAULT 25
    CHECK (photo_focal_y >= 0 AND photo_focal_y <= 100);

COMMENT ON COLUMN public.nurse_profiles.photo_focal_x IS
  'Horizontal focal point of the profile photo, 0-100, used as CSS object-position. Default 50 matches the card''s previous fixed crop.';
COMMENT ON COLUMN public.nurse_profiles.photo_focal_y IS
  'Vertical focal point of the profile photo, 0-100. Default 25 is the upper-third heuristic the card used before nurses could set their own.';

-- Verification, so the paste can be seen to have worked rather than trusted:
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nurse_profiles'
  AND column_name IN ('photo_focal_x', 'photo_focal_y')
ORDER BY column_name;
