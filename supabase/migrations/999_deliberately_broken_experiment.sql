-- EXPERIMENT ONLY, for issue #803. Never to be merged.
--
-- #803 wants to drop `supabase db reset` from the E2E job because `supabase
-- start` already applies every migration and the seed. The workflow comment
-- credits reset with surfacing a broken migration, so before dropping it we
-- have to see `start` go red on one for real, rather than assume it does (L1).
--
-- This references a table that does not exist, so it cannot apply.
ALTER TABLE this_table_does_not_exist_and_never_will ADD COLUMN nope text;
