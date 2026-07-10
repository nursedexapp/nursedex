/**
 * Detect owner-scoped RLS policies that can rewrite any column on a row.
 *
 * PR #511 fixed three findings (#384, #385, #386, #388, #389) that all traced
 * to one omission: a `FOR UPDATE` policy with `USING (owner = auth.uid())` and
 * no `WITH CHECK`. Postgres then reuses the USING expression as the check, so
 * the owner may rewrite ANY column on their own row, not just the intended
 * one. Issue #512 found a fourth instance (`hires`) the audit had missed.
 * Nothing stopped a new migration from reintroducing it (#513).
 *
 * Scope note: only UPDATE and ALL can exhibit this. Postgres rejects `USING`
 * on a `FOR INSERT` policy, so an INSERT policy always carries an explicit
 * WITH CHECK. SELECT and DELETE have no WITH CHECK clause at all.
 *
 * This reads the APPLIED policies out of `pg_policies`, not the text of
 * supabase/migrations/*.sql. The migrations contain 93 CREATE POLICY and 28
 * DROP POLICY statements, so their text holds superseded definitions that the
 * database no longer enforces. The catalog is the only source of truth.
 */

export interface PolicyRow {
  schemaname: string;
  tablename: string;
  policyname: string;
  /** SELECT | INSERT | UPDATE | DELETE | ALL */
  cmd: string;
  /** The USING expression, or null. */
  qual: string | null;
  /** The WITH CHECK expression. Null is the bug. */
  with_check: string | null;
}

/** Only these commands have a WITH CHECK that can be omitted. */
const GUARDED_COMMANDS = new Set(["UPDATE", "ALL"]);

export function policyKey(row: PolicyRow): string {
  return `${row.schemaname}.${row.tablename}.${row.policyname}`;
}

/**
 * Policies missing a WITH CHECK, excluding allowlisted ones.
 *
 * Throws rather than returning [] on an empty catalog read: a failed query
 * reported as "no violations" would be a false all-clear on precisely the
 * condition this guard exists to catch. Also throws on a stale allowlist
 * entry, so an exemption cannot outlive the policy it was written for and
 * silently cover a future policy that reuses the name.
 */
export function findPoliciesMissingWithCheck(
  rows: PolicyRow[],
  allowlist: readonly string[],
): PolicyRow[] {
  if (rows.length === 0) {
    throw new Error(
      "pg_policies returned no policies; the catalog query failed or ran against the wrong database",
    );
  }

  const existing = new Set(rows.map(policyKey));
  const stale = allowlist.filter((entry) => !existing.has(entry));
  if (stale.length > 0) {
    throw new Error(
      `stale allowlist entries, these policies no longer exist: ${stale.join(", ")}`,
    );
  }

  const allowed = new Set(allowlist);
  return rows.filter(
    (row) =>
      row.schemaname === "public" &&
      GUARDED_COMMANDS.has(row.cmd.toUpperCase()) &&
      row.with_check === null &&
      !allowed.has(policyKey(row)),
  );
}

export function formatViolations(violations: PolicyRow[]): string {
  if (violations.length === 0) {
    return "Every owner-scoped UPDATE/ALL policy has an explicit WITH CHECK.";
  }

  const lines = [
    `${violations.length} RLS ${violations.length === 1 ? "policy" : "policies"} can rewrite any column on a row.`,
    "",
    "Postgres reuses USING as the check when WITH CHECK is omitted, so the row's",
    "owner may change any column on it, not just the intended one.",
    "",
  ];

  for (const row of violations) {
    lines.push(`  ${policyKey(row)}  FOR ${row.cmd.toUpperCase()}`);
    lines.push(`    USING (${row.qual ?? "true"})  WITH CHECK <missing>`);
  }

  lines.push(
    "",
    "Add an explicit WITH CHECK to each, or add it to ALLOWED_WITHOUT_WITH_CHECK",
    "in src/lib/__tests__/rls-with-check.test.ts with a written justification.",
  );

  return lines.join("\n");
}
