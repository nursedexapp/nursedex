/*
 * The production permission surface, as production itself reports it (#521).
 *
 * Read-only. It SELECTs from the system catalog and touches no application
 * data, which is what makes it safe to point at production, and pointing it at
 * production is the entire point: a fresh CI database cannot tell you what the
 * real one currently allows.
 *
 * Checked by scripts/prod-smoke.ts against the grants the code actually needs.
 *
 * A block comment, not `--`: the CLI takes this file's contents as an argument,
 * and an argument starting with `--` is read as a flag.
 */
SELECT
  'function' AS kind,
  p.proname  AS name,
  r.rolname  AS role,
  'EXECUTE'  AS privilege,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS granted
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.prokind = 'f'

UNION ALL

SELECT
  'table'   AS kind,
  c.relname AS name,
  r.rolname AS role,
  pr.priv   AS privilege,
  has_table_privilege(r.rolname, c.oid, pr.priv) AS granted
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS pr(priv)
WHERE n.nspname = 'public'
  AND c.relkind = 'r'

ORDER BY kind, name, role, privilege;
