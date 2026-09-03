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
import { readFileSync } from "node:fs";

/** Anything closer than this is left alone: it moves nobody meaningfully. */
export const CORRECTION_MILES = 3;

export interface ZipPoint {
  zip: string;
  latitude: number;
  longitude: number;
}

export interface ZipCorrection extends ZipPoint {
  /** How far the stored position is from the reference. */
  miles: number;
}

function milesBetween(a: ZipPoint, b: ZipPoint): number {
  const R = 3959;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

/**
 * The stored zips that are far enough from the reference to be worth moving,
 * carrying the reference position to move them to.
 *
 * A zip the reference has never heard of is skipped rather than treated as an
 * error: four rows are carried over from the launch seed precisely because
 * GeoNames has no entry for them, and refusing the whole run over rows nobody
 * can correct would stop the ones that can be.
 */
export function zipsNeedingCorrection(
  storedRows: ZipPoint[],
  reference: Map<string, ZipPoint>,
  threshold = CORRECTION_MILES,
): ZipCorrection[] {
  const out: ZipCorrection[] = [];
  for (const stored of storedRows) {
    const ref = reference.get(stored.zip);
    if (!ref) continue;
    const miles = milesBetween(stored, ref);
    if (miles > threshold) {
      out.push({
        zip: stored.zip,
        latitude: ref.latitude,
        longitude: ref.longitude,
        miles,
      });
    }
  }
  return out;
}

export function summariseZips(corrections: ZipCorrection[]): string {
  if (corrections.length === 0) {
    return `No zip is more than ${CORRECTION_MILES} miles from the reference.`;
  }
  const worst = corrections.reduce((a, b) => (a.miles > b.miles ? a : b));
  return `${corrections.length} zips are more than ${CORRECTION_MILES} miles out; the worst (${worst.zip}) is ${worst.miles.toFixed(1)} miles.`;
}

/** The reference list the seed is generated from. */
export function readReference(path = "data/ny_zip_codes.csv"): Map<string, ZipPoint> {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const cols = header.split(",");
  const iZip = cols.indexOf("zip");
  const iLat = cols.indexOf("latitude");
  const iLng = cols.indexOf("longitude");
  if (iZip < 0 || iLat < 0 || iLng < 0) {
    throw new Error(`${path} does not carry zip, latitude and longitude.`);
  }
  const out = new Map<string, ZipPoint>();
  for (const line of lines) {
    const parts = line.split(",");
    out.set(parts[iZip], {
      zip: parts[iZip],
      latitude: Number(parts[iLat]),
      longitude: Number(parts[iLng]),
    });
  }
  return out;
}


interface RequestDeps {
  fetchFn: typeof fetch;
  url: string;
  headers: Record<string, string>;
}

/**
 * Every zip row, paged, and only when the whole list arrived.
 *
 * A short page ends the loop, which is also exactly what a truncated read
 * looks like, so the total is checked against the count the server reports.
 * Correcting a partial list would report success and leave the rest wrong.
 *
 * The fetch is an argument so this can be exercised without a network: the
 * part that decides whether the list is complete is the part most worth
 * testing, and a function that builds its own client cannot be.
 */
export async function readAllZips(
  deps: RequestDeps & { pageSize?: number },
): Promise<ZipPoint[]> {
  const pageSize = deps.pageSize ?? 1000;
  const rows: ZipPoint[] = [];
  let reportedTotal: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const res = await deps.fetchFn(
      `${deps.url}/rest/v1/zip_codes?select=zip,latitude,longitude&order=zip`,
      {
        headers: {
          ...deps.headers,
          Range: `${from}-${from + pageSize - 1}`,
          Prefer: "count=exact",
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Read failed: ${res.status} ${await res.text()}`);
    }
    if (reportedTotal === null) {
      const total = res.headers.get("content-range")?.split("/")[1];
      reportedTotal =
        total && total !== "*" && Number.isInteger(Number(total))
          ? Number(total)
          : null;
    }
    const page = (await res.json()) as ZipPoint[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  if (reportedTotal === null) {
    throw new Error(
      "The server gave no count, so a partial read could not be told from a complete one. Refusing to correct.",
    );
  }
  if (rows.length !== reportedTotal) {
    throw new Error(
      `Read ${rows.length} zips but the server reports ${reportedTotal}. Refusing to correct a partial list.`,
    );
  }
  return rows;
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
