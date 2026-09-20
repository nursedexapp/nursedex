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
// The decision and the paged read now live in src, because the weekly data
// drift cron (#927) asks the same question and two copies of "which rows have
// drifted" would be two answers. Re-exported so this script's own tests and
// any existing caller keep their import path.
export {
  rowsNeedingRepair,
  summarise,
  parseReportedTotal,
  readScoredProfiles,
  type DriftRow,
  type ScoredRow,
} from "../src/lib/data-drift/completeness";
import { createClient } from "@supabase/supabase-js";
import {
  rowsNeedingRepair,
  summarise,
  readScoredProfiles,
} from "../src/lib/data-drift/completeness";

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

  // Paged, and only when the whole roster arrived: the reader refuses a short
  // read rather than repairing a prefix. It lives in src alongside the rule,
  // so the monitor and the repair cannot read different populations, and both
  // judge only the nurses the directory lists.
  const client = createClient(url, key, { auth: { persistSession: false } });
  const rows = await readScoredProfiles({ client });

  const drift = rowsNeedingRepair(rows);
  console.log(`Examined ${rows.length} listed nurses.`);
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
