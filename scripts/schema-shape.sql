/*
 * The shape of the public schema, as the database itself reports it (#890).
 *
 * Read-only. It SELECTs from the system catalog and touches no application
 * data, which is what makes it safe to point at production.
 *
 * Run against BOTH a database built from the migrations and production, and
 * compared by scripts/check-schema-drift.ts. Migration Drift compares version
 * NUMBERS, so once a version is recorded as applied the file and the database
 * can disagree in any way at all and it reports "in sync" forever. This asks
 * what production actually HAS.
 *
 * That case is not hypothetical: migrations 066 and 067 were applied through
 * the Supabase dashboard by hand, assembled from the files rather than
 * executed from them, and the history row saying so was written by hand too.
 *
 * Every row is one fact with a stable identity, so the comparison is a set
 * difference rather than a diff of two documents in whatever order the
 * database felt like returning them.
 *
 * A block comment, not `--`: the CLI can take this file's contents as an
 * argument, and an argument starting with `--` is read as a flag.
 */
SELECT
  'column' AS kind,
  c.table_name || '.' || c.column_name AS name,
  c.data_type
    || ' ' || (CASE WHEN c.is_nullable = 'YES' THEN 'null' ELSE 'not null' END)
    || ' default ' || coalesce(c.column_default, '-')
    AS detail
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'

UNION ALL

/*
 * Indexes by DEFINITION, not by name. A renamed index with the same columns
 * is a different fact from a missing one, and both matter.
 */
SELECT
  'index' AS kind,
  i.tablename || '.' || i.indexname AS name,
  i.indexdef AS detail
FROM pg_indexes i
WHERE i.schemaname = 'public'

UNION ALL

/*
 * Constraints, which is where a check or a foreign key applied by hand and
 * subtly different from its file would show up.
 */
SELECT
  'constraint' AS kind,
  rel.relname || '.' || con.conname AS name,
  pg_get_constraintdef(con.oid) AS detail
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'

UNION ALL

/*
 * Enum types and their labels, in order. A value added to an enum in one place
 * and not the other is invisible to every other check here.
 */
SELECT
  'enum' AS kind,
  t.typname AS name,
  string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS detail
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname

UNION ALL

/*
 * Whether row level security is ON. A table with its policies intact but RLS
 * switched off is open to everyone, and nothing else in this query would say
 * so: the policies are all still there.
 */
SELECT
  'rls' AS kind,
  rel.relname AS name,
  (CASE WHEN rel.relrowsecurity THEN 'enabled' ELSE 'DISABLED' END) AS detail
FROM pg_class rel
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relkind = 'r'

UNION ALL

/*
 * The policies themselves, by their expressions. A policy narrowed or widened
 * by hand keeps its name.
 */
SELECT
  'policy' AS kind,
  p.tablename || '.' || p.policyname AS name,
  p.cmd
    || ' to ' || array_to_string(p.roles, ',')
    || ' using ' || coalesce(p.qual, '-')
    || ' check ' || coalesce(p.with_check, '-')
    AS detail
FROM pg_policies p
WHERE p.schemaname = 'public'

ORDER BY 1, 2;
