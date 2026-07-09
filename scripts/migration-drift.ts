/**
 * Detect drift between the migrations committed to git and those actually
 * applied to the production database.
 *
 * Merging a PR with a new migration does not deploy it. Migration 043, which
 * blocked a user from promoting themselves to super-admin, sat merged but
 * unapplied in production until it was found by accident (#518). Nothing
 * signalled the gap. This module powers the scheduled check that does.
 *
 * Parses `supabase migration list --linked --output-format json`, whose
 * payload looks like:
 *
 *   { "migrations": [ { "local": "055", "remote": "055", "time": "055" } ],
 *     "message": "Migrations listed" }
 *
 * A migration present locally but with an empty `remote` has not been applied.
 */

export interface MigrationRow {
  local?: string;
  remote?: string;
  time?: string;
}

export interface DriftReport {
  /** Committed to git but never applied to production. The #518 hazard. */
  pending: string[];
  /** Applied to production but absent from git. Someone pushed by hand. */
  untracked: string[];
  hasDrift: boolean;
}

/**
 * Pull the JSON payload out of the CLI's output, which is preceded by
 * progress lines like "Connecting to remote database...".
 *
 * Throws rather than returning an empty list: a failed CLI invocation must
 * never be reported as "no drift", which would be a false all-clear on
 * exactly the condition this check exists to catch.
 */
export function parseMigrationList(raw: string): MigrationRow[] {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));

  if (!line) {
    throw new Error(
      "supabase migration list produced no JSON payload; the CLI likely failed to connect",
    );
  }

  const parsed: unknown = JSON.parse(line);
  const migrations = (parsed as { migrations?: unknown })?.migrations;
  if (!Array.isArray(migrations)) {
    throw new Error(
      "supabase migration list payload has no migrations array",
    );
  }
  return migrations as MigrationRow[];
}

export function detectDrift(rows: MigrationRow[]): DriftReport {
  const pending: string[] = [];
  const untracked: string[] = [];

  for (const row of rows) {
    const local = row.local ?? "";
    const remote = row.remote ?? "";
    if (local && !remote) pending.push(local);
    else if (remote && !local) untracked.push(remote);
  }

  return { pending, untracked, hasDrift: pending.length + untracked.length > 0 };
}

export function formatDriftReport(report: DriftReport): string {
  if (!report.hasDrift) {
    return "Migrations are in sync: every local migration is applied to production.";
  }

  const lines: string[] = ["Database migration drift detected."];

  if (report.pending.length > 0) {
    lines.push(
      "",
      `Committed to git but NOT applied to production: ${report.pending.join(", ")}`,
      "Code depending on these migrations may already be live. Apply them with:",
      "  npx supabase db push",
    );
  }

  if (report.untracked.length > 0) {
    lines.push(
      "",
      `Applied to production but not in git: ${report.untracked.join(", ")}`,
      "Someone applied a migration by hand. Commit it so the history matches.",
    );
  }

  return lines.join("\n");
}
