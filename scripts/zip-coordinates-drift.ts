/**
 * Aligns the zip coordinates in production with the reference list the seed is
 * generated from (#797).
 *
 * 218 zips were seeded by hand at launch. When the full GeoNames list arrived,
 * migration 065 used ON CONFLICT DO NOTHING so those rows kept their original
 * coordinates, deliberately: overwriting them would have moved the results of
 * searches families had already saved. That was the right call while distance
 * did nothing. It stopped being the right call when distance started ordering
 * the directory (#723), because a zip placed in the wrong town now puts every
 * nurse in it in the wrong place.
 *
 * Measured against production on 2026-09-03: 21 zips sit more than three miles
 * from the reference, the worst 41.6 miles, and exactly two people live in any
 * of them (a nurse and a family, both in one zip, both moved four miles).
 *
 * Reports by default and only writes with --apply.
 *
 *   npx tsx scripts/zip-coordinates-drift.ts
 *   npx tsx scripts/zip-coordinates-drift.ts --apply
 */
// The decision, the reference and the paged read now live in src, because the
// weekly data drift cron (#927) asks the same question and two copies of
// "which zips have drifted" would be two answers. Re-exported here so the
// script's own tests and any existing caller keep their import path.
export {
  CORRECTION_MILES,
  zipsNeedingCorrection,
  summariseZips,
  readReference,
  readAllZips,
  type ZipPoint,
  type ZipCorrection,
} from "../src/lib/data-drift/zips";
import {
  zipsNeedingCorrection,
  summariseZips,
  readReference,
  readAllZips,
  type ZipCorrection,
} from "../src/lib/data-drift/zips";

interface RequestDeps {
  fetchFn: typeof fetch;
  url: string;
  headers: Record<string, string>;
}

/**
 * Moves each zip, and answers how many actually moved.
 *
 * A row that fails is counted as not moved rather than skipped silently:
 * reporting "21 of 21" while one quietly failed is exactly the claim this
 * script exists to be able to make honestly.
 */
export async function applyCorrections(
  deps: RequestDeps & { corrections: ZipCorrection[] },
): Promise<number> {
  let moved = 0;
  for (const c of deps.corrections) {
    const res = await deps.fetchFn(
      `${deps.url}/rest/v1/zip_codes?zip=eq.${c.zip}`,
      {
        method: "PATCH",
        headers: { ...deps.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: c.latitude, longitude: c.longitude }),
      },
    );
    if (!res.ok) {
      console.error(`  FAILED ${c.zip}: ${res.status} ${await res.text()}`);
      continue;
    }
    moved++;
  }
  return moved;
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

  const rows = await readAllZips({ fetchFn: fetch, url, headers });

  const corrections = zipsNeedingCorrection(rows, readReference());
  console.log(`Checked ${rows.length} zips.`);
  console.log(summariseZips(corrections));

  if (!apply) {
    if (corrections.length > 0) {
      console.log("\nReport only. Re-run with --apply to move them.");
    }
    return;
  }

  const moved = await applyCorrections({
    fetchFn: fetch,
    url,
    headers,
    corrections,
  });
  console.log(`Moved ${moved} of ${corrections.length} zips.`);
  if (moved !== corrections.length) {
    throw new Error(
      `${corrections.length - moved} zips could not be moved; re-run to finish.`,
    );
  }
}

if (process.argv[1]?.endsWith("zip-coordinates-drift.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
