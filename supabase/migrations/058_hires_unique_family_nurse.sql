-- #651. `hires` was the only one of the three family/nurse relationship tables
-- without a uniqueness constraint: `reveals` (001_schema.sql:133) and
-- `saved_nurses` (:142) both carry UNIQUE (family_user_id, nurse_user_id), and
-- `hires` did not.
--
-- recordFamilyHire was therefore a check-then-act: SELECT an existing hire,
-- return already_recorded if one is found, otherwise INSERT. Two concurrent
-- callers (a family double-firing a stalled button, a retry) both miss the
-- check and both insert, producing two hire rows for the same pair and mailing
-- the nurse twice. Careful ordering in application code cannot serialize that;
-- only the database can.
--
-- No de-duplication step is needed: `hires` was verified empty in production
-- before this migration was written, so there is nothing to collapse. Should
-- that ever stop being true, this ALTER fails loudly rather than silently
-- dropping a row, which is the safe direction.

ALTER TABLE public.hires
  ADD CONSTRAINT hires_family_user_id_nurse_user_id_key
  UNIQUE (family_user_id, nurse_user_id);
