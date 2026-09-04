-- ============================================================
-- Title case the languages already stored on nurse profiles
-- ============================================================
--
-- The profile form normalised capitalisation by uppercasing the first
-- character and lowercasing the rest. Right for "spanish", wrong for every
-- two word language: clicking the form's own "Haitian Creole" suggestion
-- stored "Haitian creole" (#934).
--
-- It was invisible while the directory's language filter came from a
-- hardcoded list. That list said "Haitian Creole" and the filter is an exact
-- array overlap, so the filter could never match and the stored spelling was
-- never displayed. #766 derives the options from the stored values, so the
-- filter works and the stored spelling is now what a family reads.
--
-- Measured against production on 2026-09-03, before this ran: 134 profiles,
-- 15 distinct languages, one of them wrong. "Haitian creole" was held by 4
-- profiles; every other spelling was already correct.
--
-- This has to ship with the code change, not after it. Correcting the writer
-- alone would put a second option on the filter row the first time somebody
-- re-saved a profile ("Haitian Creole (1)" beside "Haitian creole (3)"),
-- which is worse than the state it replaces.
--
-- initcap() is the title case here. It capitalises the first letter of each
-- run of alphanumerics, so it agrees with the application's own normaliser on
-- spaces and hyphens. The two differ after an apostrophe (initcap writes
-- K'Iche', the app writes K'iche'); no stored value contains one, measured
-- above, so nothing in this table can be reached by that difference.
--
-- Deduplicates on the normalised form as well as rewriting it: two spellings
-- that title case to the same language are one language, and leaving both
-- would put the same thing on the filter row twice. First occurrence wins, so
-- the order a nurse entered them in survives.

DO $$
DECLARE
  repaired integer;
BEGIN
  WITH normalized AS (
    SELECT
      p.id,
      (
        SELECT array_agg(d.lang ORDER BY d.ord)
        FROM (
          SELECT DISTINCT ON (initcap(u.lang))
            initcap(u.lang) AS lang,
            u.ord
          FROM unnest(p.languages) WITH ORDINALITY AS u(lang, ord)
          ORDER BY initcap(u.lang), u.ord
        ) d
      ) AS langs
    FROM public.nurse_profiles p
  )
  UPDATE public.nurse_profiles p
  SET languages = n.langs
  FROM normalized n
  WHERE p.id = n.id
    AND p.languages IS DISTINCT FROM n.langs;

  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'nurse_profiles: rewrote languages on % row(s)', repaired;

  -- Assert the END STATE, not that the UPDATE touched something. A database
  -- built fresh from these migrations has nothing to repair, and that zero is
  -- correct; a zero here would not be.
  SELECT count(*) INTO repaired
  FROM public.nurse_profiles p
  WHERE EXISTS (
    SELECT 1
    FROM unnest(p.languages) AS lang
    WHERE lang <> initcap(lang)
  );

  IF repaired > 0 THEN
    RAISE EXCEPTION 'nurse_profiles still holds % row(s) with an untitled language', repaired;
  END IF;
END
$$;
