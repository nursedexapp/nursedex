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

/** The alert call, narrowed to what this check needs (see scripts/slack-alert.ts). */
type AnnounceFn = (args: {
  title: string;
  report: string;
  token: string | undefined;
}) => Promise<void>;

export interface DriftCheckOptions {
  /** Raw stdout from `supabase migration list --linked --output-format json`. */
  raw: string;
  announceImpl: AnnounceFn;
  token: string | undefined;
  log: (message: string) => void;
}

/**
 * The whole decision the CI entry point makes, in one testable place (#816).
 *
 * Returns the process exit code rather than calling process.exit, so every
 * outcome can be exercised: in sync, drifted, and the payload that could not
 * be read at all. The last of those gets its own wording, because "the check
 * could not run" and "production is missing a migration" send whoever reads
 * the alert to two different places (L11).
 *
 * A failing alert never changes the verdict. The job that found the drift has
 * to survive long enough to print it and exit non zero, so an alerter that
 * throws is logged and stepped over rather than allowed to take the run down.
 */
export async function runDriftCheck({
  raw,
  announceImpl,
  token,
  log,
}: DriftCheckOptions): Promise<number> {
  let report: DriftReport;
  try {
    report = detectDrift(parseMigrationList(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Migration drift check could not run: ${message}`);
    await announceImpl({
      title: "Migration drift check could not run",
      report:
        `${message}\n\n` +
        "Nothing was compared, so this is not an all clear: production may or " +
        "may not be in step with git.",
      token,
    }).catch((alertErr: unknown) => {
      log(
        `Could not post the Slack alert: ${
          alertErr instanceof Error ? alertErr.message : String(alertErr)
        }`,
      );
    });
    return 1;
  }

  const text = formatDriftReport(report);
  log(text);
  if (!report.hasDrift) return 0;

  await announceImpl({
    title: "Migration drift detected",
    report: text,
    token,
  }).catch((alertErr: unknown) => {
    log(
      `Could not post the Slack alert: ${
        alertErr instanceof Error ? alertErr.message : String(alertErr)
      }`,
    );
  });
  return 1;
}
