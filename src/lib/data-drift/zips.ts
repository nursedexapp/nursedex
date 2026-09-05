/**
 * Zip codes whose stored coordinates disagree with the reference list the seed
 * is generated from (#797).
 *
 * 218 zips were seeded by hand at launch. When the full GeoNames list arrived,
 * migration 065 used ON CONFLICT DO NOTHING so those rows kept their original
 * coordinates, deliberately: overwriting them would have moved the results of
 * searches families had already saved. That stopped being the right call when
 * distance started ordering the directory (#723), because a zip placed in the
 * wrong town puts every nurse in it in the wrong place. Measured against
 * production on 2026-09-03: 21 zips sit more than three miles out, the worst
 * 41.6 miles.
 *
 * The decision and the read live here rather than in the script that found it,
 * because the weekly cron that watches for it (#927) has to ask the same
 * question, and two copies of "which zips have drifted" would be two answers.
 * Applying a correction stays in the script: the monitor reports and a person
 * decides.
 */
import { readFileSync } from "node:fs";
import { parseReportedTotal } from "./completeness";

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

/** Blank is not zero: an empty field must not read as a valid coordinate. */
function numberOrNaN(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return Number.NaN;
  return Number(raw);
}

/** The reference list the seed is generated from. */
export function readReference(
  path = "data/ny_zip_codes.csv",
): Map<string, ZipPoint> {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const cols = header.split(",");
  const iZip = cols.indexOf("zip");
  const iLat = cols.indexOf("latitude");
  const iLng = cols.indexOf("longitude");
  if (iZip < 0 || iLat < 0 || iLng < 0) {
    throw new Error(`${path} does not carry zip, latitude and longitude.`);
  }
  const out = new Map<string, ZipPoint>();
  for (const [index, line] of lines.entries()) {
    const parts = line.split(",");
    // Number("") is 0, not NaN, so a BLANK coordinate would silently become a
    // point off the coast of Africa rather than an unreadable one. Both are
    // refused, and the blank is the more dangerous of the two because it looks
    // like a perfectly good number all the way down.
    const latitude = numberOrNaN(parts[iLat]);
    const longitude = numberOrNaN(parts[iLng]);
    // Refused rather than stored. A coordinate that will not parse becomes
    // NaN, the distance to it is NaN, and NaN compares false against the
    // threshold, so the zip is silently declared fine and never reported: the
    // failure lands on the permissive side with nothing raised (L50).
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(
        `${path} line ${index + 2} has coordinates that are not numbers ` +
          `(${parts[iZip]}: ${parts[iLat]}, ${parts[iLng]}). A zip with an ` +
          "unreadable position would be skipped and read as correct.",
      );
    }
    out.set(parts[iZip], { zip: parts[iZip], latitude, longitude });
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
      // The same parser the profile read uses, not a second copy of it. Both
      // ask PostgREST the same question and both map an unreadable answer to
      // the same refusal, and two implementations of that would be two answers
      // that drift apart silently.
      reportedTotal = parseReportedTotal(res.headers.get("content-range"));
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
