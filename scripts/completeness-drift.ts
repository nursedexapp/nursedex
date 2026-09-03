/**
 * Finds and repairs nurse profiles whose STORED completeness score disagrees
 * with what their profile actually earns (#727).
 *
 * The stored score is what search ranks on. It was written only when a nurse
 * saved the main profile form, so any other write that touched a scored field
 * left it behind. Measured against production on 2026-09-03: 42 of 106
 * verified profiles were scored below what they earn, none above, some by 40
 * to 65 points.
 *
 * Reports by default and only writes with --apply, and every write is a value
 * the profile already earns, so it cannot invent credit for anybody.
 *
 *   npx tsx scripts/completeness-drift.ts
 *   npx tsx scripts/completeness-drift.ts --apply
 */
import {
  calculateCompleteness,
  COMPLETENESS_COLUMNS,
  type CompletenessInput,
} from "../src/lib/profile/completeness";

export interface DriftRow {
  user_id: string;
  stored: number;
  derived: number;
}

type ScoredRow = CompletenessInput & {
  user_id: string;
  profile_completeness: number;
};

/** The rows whose stored score is not what their profile earns. */
export function rowsNeedingRepair(rows: ScoredRow[]): DriftRow[] {
  const out: DriftRow[] = [];
  for (const row of rows) {
    const { score } = calculateCompleteness(row);
    if (score !== row.profile_completeness) {
      out.push({
        user_id: row.user_id,
        stored: row.profile_completeness,
        derived: score,
      });
    }
  }
  return out;
}

/**
 * Both directions, counted separately. A score that is too HIGH is a nurse
 * ranked on credit she does not have, which is a different and worse thing
 * than one ranked too low, and folding them into one number would hide it.
 */
export function summarise(drift: DriftRow[]): string {
  if (drift.length === 0) return "No drift: every stored score is what the profile earns.";

  const low = drift.filter((d) => d.derived > d.stored);
  const high = drift.filter((d) => d.derived < d.stored);
  const gaps = low.map((d) => d.derived - d.stored).sort((a, b) => a - b);

  const lines = [
    `${low.length} scored below what the profile earns` +
      (gaps.length
        ? ` (by ${gaps[0]} to ${gaps[gaps.length - 1]} points)`
        : ""),
    `${high.length} scored above what the profile earns`,
  ];
  return lines.join("\n");
}

/**
 * How many rows the server says there are, from a PostgREST content-range
 * header, or null when it does not say or says something we cannot read.
 *
 * Returned as null rather than a number, and mapped to a refusal by the
 * caller, because a value parsed straight into a comparison lands on the
 * permissive side when the parse fails: NaN compares unequal to everything,
 * and "*" or a missing header would otherwise become 0 and make an empty read
 * look complete.
 */
export function parseReportedTotal(contentRange: string | null): number | null {
  const total = contentRange?.split("/")[1];
  if (!total || total === "*") return null;
  const parsed = Number(total);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.",
    );
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // Paged rather than one unbounded read: PostgREST caps a select at a page
  // and returns a healthy looking prefix, so an unbounded read would repair
  // the first page and silently leave the rest.
  //
  // A short page ends the loop, which is also what a truncated read looks
  // like, so the total is checked against the count the server reports. A
  // repair that quietly covered half the roster would report success and
  // leave the other half wrong, which is the failure this whole script exists
  // to find.
  const rows: ScoredRow[] = [];
  const pageSize = 500;
  let reportedTotal: number | null = null;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/nurse_profiles?select=user_id,profile_completeness,${encodeURIComponent(COMPLETENESS_COLUMNS)}`,
      {
        headers: {
          ...headers,
          Range: `${from}-${from + pageSize - 1}`,
          Prefer: "count=exact",
        },
      },
    );
    if (!res.ok) throw new Error(`Read failed: ${res.status} ${await res.text()}`);
    if (reportedTotal === null) {
      reportedTotal = parseReportedTotal(res.headers.get("content-range"));
    }
    const page = (await res.json()) as ScoredRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  if (reportedTotal === null) {
    throw new Error(
      "The server did not report how many profiles there are, so a short read could not be told from a complete one.",
    );
  }
  if (rows.length !== reportedTotal) {
    throw new Error(
      `Read ${rows.length} profiles but the server reports ${reportedTotal}. Refusing to repair a partial roster.`,
    );
  }

  const drift = rowsNeedingRepair(rows);
  console.log(`Examined ${rows.length} profiles.`);
  console.log(summarise(drift));

  if (!apply) {
    console.log(
      drift.length > 0 ? "\nReport only. Re-run with --apply to repair." : "",
    );
    return;
  }

  let repaired = 0;
  for (const d of drift) {
    const res = await fetch(
      `${url}/rest/v1/nurse_profiles?user_id=eq.${d.user_id}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ profile_completeness: d.derived }),
      },
    );
    if (!res.ok) {
      console.error(`  FAILED ${d.user_id}: ${res.status} ${await res.text()}`);
      continue;
    }
    repaired++;
  }
  console.log(`Repaired ${repaired} of ${drift.length} rows.`);
  if (repaired !== drift.length) {
    throw new Error(
      `${drift.length - repaired} rows could not be repaired; re-run to finish.`,
    );
  }
}

// Only when run directly, so the tests can import the pure parts.
if (process.argv[1]?.endsWith("completeness-drift.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
