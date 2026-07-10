/**
 * Flag RLS UPDATE/ALL policies that have no explicit `WITH CHECK`.
 *
 * What omitting it actually does, precisely: for an UPDATE policy, `USING`
 * tests the row as it exists and `WITH CHECK` tests the row as it will be.
 * When `WITH CHECK` is omitted, Postgres reuses the `USING` expression as the
 * new-row check. So the policy is only as good as `USING` is at constraining
 * every sensitive column.
 *
 * That is the #384/#385/#386 bug class. `users_update_own` was
 * `USING (id = auth.uid())` with no WITH CHECK, and a row with a rewritten
 * `role` still satisfies `id = auth.uid()`, so the owner could promote
 * themselves. PR #511 fixed those. #512 found a fourth instance in `hires`.
 * Nothing stopped a new migration from reintroducing the pattern (#513).
 *
 * A missing WITH CHECK is therefore a SMELL, not a proven hole:
 * `family_profiles_update_own` is `USING (user_id = auth.uid())`, whose only
 * sensitive column is the one the predicate already pins. This check exists to
 * force that judgement to be made and written down, once, per policy, instead
 * of being rediscovered by another security audit. Hence the allowlist.
 *
 * Scope: only UPDATE and ALL can exhibit this. Postgres rejects `USING` on a
 * `FOR INSERT` policy, so an INSERT policy always carries an explicit WITH
 * CHECK. SELECT and DELETE have no WITH CHECK clause at all.
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
    return "Every UPDATE/ALL policy has an explicit WITH CHECK or a reviewed exemption.";
  }

  const lines = [
    `${violations.length} RLS ${violations.length === 1 ? "policy has" : "policies have"} no explicit WITH CHECK.`,
    "",
    "Postgres reuses USING as the new-row check when WITH CHECK is omitted, so",
    "each policy below is only as strong as its USING clause. Confirm that USING",
    "constrains every column a caller must not be able to rewrite (role, prices,",
    "approval flags, ownership columns).",
    "",
  ];

  for (const row of violations) {
    lines.push(`  ${policyKey(row)}  FOR ${row.cmd.toUpperCase()}`);
    lines.push(`    USING (${row.qual ?? "true"})  WITH CHECK <missing>`);
  }

  lines.push(
    "",
    "Add an explicit WITH CHECK to each, or, if USING already covers every",
    "sensitive column, add it to ALLOWED_WITHOUT_WITH_CHECK in",
    "src/lib/__tests__/rls-with-check.test.ts with a written justification.",
  );

  return lines.join("\n");
}
