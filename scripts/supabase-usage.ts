/**
 * How close production is to the usage its plan includes (#746).
 *
 * The organization runs Pro with the spend cap ON. That setting trades cost
 * certainty for availability: going past the included usage does not produce a
 * bill, it restricts the project. The failure then arrives as the database
 * refusing writes, which reaches people as saves failing across the whole
 * product and names nothing about the cause. Nobody would connect that to a
 * billing setting without being told.
 *
 * WHAT THIS CAN SEE, and what it cannot.
 *
 * Supabase's public Management API exposes no usage, quota or billing endpoint
 * at all: its full specification, read on 2026-09-01, has 115 paths and none of
 * them are billing. So there is no way to ask the platform "how much of the
 * plan is left". What IS answerable is what the database can be asked
 * directly: its own size, and the bytes in the storage bucket. Egress and
 * monthly active users, which are the two dimensions most likely to bind
 * first on a growing marketplace, are not readable this way and are named in
 * every report rather than left as a silent gap.
 */

const GB = 1024 ** 3;

/**
 * Pro plan included usage, confirmed from the billing page on 2026-09-02.
 *
 * These are the numbers the cap enforces. If the plan changes, this is the one
 * place to change, and the report prints them so a wrong figure is visible
 * rather than buried.
 */
export const PLAN_INCLUDED = {
  databaseBytes: 8 * GB,
  storageBytes: 100 * GB,
} as const;

/**
 * How much of the included usage may be consumed before this says so.
 *
 * 0.75 rather than something closer to the line, because the remedies (trim
 * usage, or lift the cap and accept overage billing) are decisions to be made
 * deliberately, not while a project is already read only. A quarter of 8GB is
 * a lot of runway at the current size, which is the point: the first warning
 * should arrive long before the cliff.
 */
export const USAGE_WARNING_FRACTION = 0.75;

export interface Usage {
  databaseBytes: number;
  storageBytes: number;
}

export interface UsageDimension {
  name: string;
  used: number;
  included: number;
}

export interface UsageResult {
  ok: boolean;
  dimensions: UsageDimension[];
  over: UsageDimension[];
}

/**
 * A bigint arrives from Postgres over JSON as a string, and "9000000000" is
 * less than 8e9 when compared as text while being more as a number. A size
 * compared without this would sit quietly under every threshold (L50).
 */
function toBytes(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(
      `The usage query's ${field} could not be read as a number (got ` +
        `${JSON.stringify(value)}). Nothing was measured, so this is not a ` +
        "report of healthy headroom.",
    );
  }
  return n;
}

/**
 * The one row the usage query returns.
 *
 * Throws on anything it cannot read. A query that never ran must fail the job
 * rather than report headroom on a production nobody actually looked at (L98).
 */
export function parseUsageRows(raw: string): Usage {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("[") || l.startsWith("{"));

  if (!line) {
    throw new Error(
      "The Supabase usage query produced no JSON payload, so it did not run. " +
        "Nothing was measured.",
    );
  }

  const parsed: unknown = JSON.parse(line);
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!row || typeof row !== "object") {
    throw new Error("The Supabase usage query returned no row.");
  }

  const record = row as Record<string, unknown>;
  return {
    databaseBytes: toBytes(record.database_bytes, "database_bytes"),
    storageBytes: toBytes(record.storage_bytes, "storage_bytes"),
  };
}

/** Which dimensions have used more than the warning fraction allows. */
export function evaluateUsage(usage: Usage): UsageResult {
  const dimensions: UsageDimension[] = [
    {
      name: "database",
      used: usage.databaseBytes,
      included: PLAN_INCLUDED.databaseBytes,
    },
    {
      name: "file storage",
      used: usage.storageBytes,
      included: PLAN_INCLUDED.storageBytes,
    },
  ];

  // Each against its OWN allowance. Judging file storage against the database's
  // would report a crisis at a fifth of its real limit.
  const over = dimensions.filter(
    (d) => d.used > d.included * USAGE_WARNING_FRACTION,
  );

  return { ok: over.length === 0, dimensions, over };
}

function humanBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${bytes} bytes`;
}

/**
 * The message, healthy or not.
 *
 * The measured numbers are printed on every run, including a quiet one: the
 * early readings are what any future threshold gets calibrated against, and a
 * check that only speaks when it is unhappy leaves nothing to calibrate from
 * (L172).
 */
export function formatUsageReport(result: UsageResult): string {
  const lines = result.dimensions.map((d) => {
    const percent = Math.round((d.used / d.included) * 100);
    return `${d.name}: ${humanBytes(d.used)} of ${humanBytes(d.included)} included (${percent}%)`;
  });

  const header = result.ok
    ? "Supabase usage is inside the plan's included allowance."
    : `Supabase usage has passed ${Math.round(
        USAGE_WARNING_FRACTION * 100,
      )}% of what the plan includes: ${result.over
        .map((d) => d.name)
        .join(" and ")}.`;

  const consequence = result.ok
    ? []
    : [
        "",
        "The spend cap is on, so passing the included usage does not raise a " +
          "bill: it restricts the project, and the database can go read only. " +
          "That reaches people as saves failing everywhere, naming nothing. " +
          "The choice between trimming usage and lifting the cap belongs here, " +
          "while there is still headroom, not during an outage.",
      ];

  return [
    header,
    "",
    ...lines,
    "",
    "Not measured here, and not readable from the database: egress and monthly " +
      "active users. Supabase's public API exposes no usage endpoint, so those " +
      "two can only be seen on the billing page, and either can bind before the " +
      "numbers above do.",
    ...consequence,
  ].join("\n");
}

/** The alert call, narrowed to what this check needs (see scripts/slack-alert.ts). */
type AnnounceFn = (args: {
  title: string;
  report: string;
  token: string | undefined;
}) => Promise<void>;

export interface UsageCheckOptions {
  /** Raw stdout from `supabase db query --linked --file scripts/supabase-usage.sql`. */
  raw: string;
  announceImpl: AnnounceFn;
  token: string | undefined;
  log: (message: string) => void;
}

/**
 * The whole decision the CI entry point makes, in one testable place.
 *
 * Returns an exit code rather than calling process.exit, so every outcome can
 * be exercised: headroom, running out, and a payload that could not be read at
 * all. The last of those gets its own wording, because "nobody could measure
 * it" and "the account is filling up" send the reader to different places
 * (L11), and reporting the first as headroom would be the exact silence this
 * check exists to break (L98).
 */
export async function runUsageCheck({
  raw,
  announceImpl,
  token,
  log,
}: UsageCheckOptions): Promise<number> {
  const alert = async (title: string, report: string): Promise<void> => {
    await announceImpl({ title, report, token }).catch((err: unknown) => {
      log(
        `Could not post the Slack alert: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  };

  let result: UsageResult;
  try {
    result = evaluateUsage(parseUsageRows(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Supabase usage check could not run: ${message}`);
    await alert(
      "Supabase usage check could not run",
      `${message}\n\nNothing was measured, so this is not a report of healthy ` +
        "headroom: the account may be close to the cap and nobody would know.",
    );
    return 1;
  }

  const report = formatUsageReport(result);
  log(report);
  if (result.ok) return 0;

  await alert(
    "Supabase usage is approaching the plan's included allowance",
    report,
  );
  return 1;
}
