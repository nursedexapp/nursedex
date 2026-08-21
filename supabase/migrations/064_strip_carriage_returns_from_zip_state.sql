-- ============================================================
-- Strip the stray carriage returns out of zip_codes.state
-- ============================================================
--
-- 217 of the 218 zip rows seeded at launch hold `state = 'NY' || chr(13)`.
-- The carriage return is INSIDE the string literal in migration 005, between
-- the Y and the closing quote, so it is stored data rather than a line ending:
--
--   ('11001', 40.7236, -73.7058, 'Floral Park', 'Nassau', 'NY<CR>'),
--
-- Nothing has read the column until now, so it has been invisible. Two things
-- were about to make it visible at once: a count of `state = 'NY'` misses
-- every one of these rows (which is how it was found, when the seed in 065
-- asserted a floor and reported 1,941 where 2,158 were expected), and the
-- redesigned nurse card renders the town and state, which would have shown
-- families "Ronkonkoma, NY" followed by a control character.
--
-- Trims every text column rather than only `state`, so a stray character
-- anywhere in this table is gone rather than only the one that was noticed.
-- Reports what it changed: a repair that reports nothing cannot be told from
-- one that found nothing to do.

DO $$
DECLARE
  repaired integer;
BEGIN
  UPDATE public.zip_codes
  SET
    zip = btrim(zip, E' \t\r\n'),
    city = btrim(city, E' \t\r\n'),
    county = btrim(county, E' \t\r\n'),
    state = btrim(state, E' \t\r\n')
  WHERE
    zip <> btrim(zip, E' \t\r\n')
    OR city <> btrim(city, E' \t\r\n')
    OR county <> btrim(county, E' \t\r\n')
    OR state <> btrim(state, E' \t\r\n');

  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'zip_codes: trimmed control characters from % row(s)', repaired;

  -- The repair has to leave none behind, whatever the starting count was. A
  -- database that already had zero (a fresh one built from these migrations
  -- after seed.sql, say) is a legitimate zero, so this asserts the end state
  -- rather than that the UPDATE touched something.
  SELECT count(*) INTO repaired
  FROM public.zip_codes
  WHERE
    zip <> btrim(zip, E' \t\r\n')
    OR city <> btrim(city, E' \t\r\n')
    OR county <> btrim(county, E' \t\r\n')
    OR state <> btrim(state, E' \t\r\n');

  IF repaired > 0 THEN
    RAISE EXCEPTION 'zip_codes still holds % row(s) with untrimmed text', repaired;
  END IF;
END
$$;
