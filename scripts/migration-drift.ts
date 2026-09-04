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
  /** Applied to production but absent from the checked out branch. */
  untracked: string[];
  hasDrift: boolean;
}

/**
 * Why a migration is applied to production but not on `main` (#908).
 *
 * This check runs against `main`, so a migration applied from a branch that
 * has not merged yet counts as untracked. That is not a mistake: for any
 * migration whose absence breaks live code it is the SAFE order. Production
 * takes new code the moment a PR merges, so applying the migration afterwards
 * leaves a window where the running code queries a column that does not exist.
 * Applying it first closes that window, at the cost of production briefly
 * being ahead of main.
 *
 * The old check failed on that, and an alert that fires on correct behaviour
 * is the kind that teaches people to ignore the channel. This one asks whether
 * the migration file exists on any branch in this repository before deciding.
 */
export type UntrackedKind =
  /** On a branch here, not yet merged. Deliberate, and clears on merge. */
  | "ahead-of-main"
  /** On no branch at all. Somebody applied SQL that exists nowhere in git. */
  | "not-in-repo"
  /** The branch lookup could not run, so nothing has been established. */
  | "unknown";

export interface UntrackedMigration {
  version: string;
  kind: UntrackedKind;
  /** The branches carrying it, when the lookup found any. */
  branches: string[];
}

export interface ClassifiedDrift {
  pending: string[];
  untracked: UntrackedMigration[];
  hasDrift: boolean;
  /**
   * Whether this should fail the job. Only "ahead-of-main" is non blocking:
   * every other state, including a lookup that could not run, still fails,
   * because standing down on a question nobody answered is how a check goes
   * quiet without anybody deciding it should.
   */
  blocking: boolean;
}

/**
 * Which branches carry the file for a migration version, or null when that
 * could not be determined. Null is deliberately distinct from an empty list:
 * "no branch has it" is a finding, "the lookup did not run" is not.
 */
export type BranchLookup = (version: string) => string[] | null;

export function classifyDrift(
  report: DriftReport,
  lookupBranches: BranchLookup,
): ClassifiedDrift {
  const untracked: UntrackedMigration[] = report.untracked.map((version) => {
    let branches: string[] | null;
    try {
      branches = lookupBranches(version);
    } catch {
      // A lookup that throws has established nothing, which is exactly the
      // "unknown" case. It must not read as "no branch has it", which would
      // accuse somebody of hand applying SQL on the strength of a broken git
      // command.
      branches = null;
    }

    if (branches === null) return { version, kind: "unknown", branches: [] };
    if (branches.length > 0)
      return { version, kind: "ahead-of-main", branches };
    return { version, kind: "not-in-repo", branches: [] };
  });

  const blocking =
    report.pending.length > 0 ||
    untracked.some((m) => m.kind !== "ahead-of-main");

  return {
    pending: report.pending,
    untracked,
    hasDrift: report.pending.length + untracked.length > 0,
    blocking,
  };
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

export function formatDriftReport(report: ClassifiedDrift): string {
  if (!report.hasDrift) {
    return "Migrations are in sync: every local migration is applied to production.";
  }

  const lines: string[] = [
    report.blocking
      ? "Database migration drift detected."
      : "Production is ahead of main, which is expected. Nothing to do.",
  ];

  if (report.pending.length > 0) {
    lines.push(
      "",
      `Committed to git but NOT applied to production: ${report.pending.join(", ")}`,
      "Live code may already be querying what these migrations create, so this",
      "is the gap worth closing first. Apply them the way migrations reach this",
      "project, then confirm with:",
      "  npx supabase migration list --linked",
      "",
      "For the next one: a migration that live code DEPENDS on is applied",
      "BEFORE its pull request merges, not after. Production takes new code the",
      "moment a PR merges, so applying afterwards leaves a window where the",
      "running code queries a column that does not exist yet.",
    );
  }

  const ahead = report.untracked.filter((m) => m.kind === "ahead-of-main");
  const missing = report.untracked.filter((m) => m.kind === "not-in-repo");
  const unknown = report.untracked.filter((m) => m.kind === "unknown");

  if (ahead.length > 0) {
    lines.push(
      "",
      `Applied to production, still on a branch: ${ahead
        .map((m) => `${m.version} (${m.branches.join(", ")})`)
        .join(", ")}`,
      "This is the safe order for a migration live code depends on, and it",
      "clears itself when the branch merges. No action needed.",
    );
  }

  if (missing.length > 0) {
    lines.push(
      "",
      `Applied to production but on NO branch in this repository: ${missing
        .map((m) => m.version)
        .join(", ")}`,
      "Somebody applied SQL that exists nowhere in git. Commit the migration so",
      "a rebuilt database matches production.",
    );
  }

  if (unknown.length > 0) {
    lines.push(
      "",
      `Applied to production, and the branch lookup could not run: ${unknown
        .map((m) => m.version)
        .join(", ")}`,
      "This is not an all clear. Nothing was established about where these came",
      "from, so they are reported rather than excused. Check that the checkout",
      "has full history (fetch-depth: 0).",
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
  /**
   * Which branches carry a given migration file (#908). Injected so the whole
   * decision stays testable without a git repository. A lookup that always
   * answers null reproduces the old behaviour: everything untracked blocks.
   */
  lookupBranches: BranchLookup;
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
  lookupBranches,
}: DriftCheckOptions): Promise<number> {
  let report: ClassifiedDrift;
  try {
    report = classifyDrift(detectDrift(parseMigrationList(raw)), lookupBranches);
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

  // Only a blocking state fails the job and pages anybody. Production being
  // briefly ahead of main is printed, so the run still records what it saw,
  // and then stepped over: alerting on the correct order is what taught
  // people to skim this channel in the first place.
  if (!report.blocking) return 0;

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
