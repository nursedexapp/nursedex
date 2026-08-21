/**
 * Render the zip_codes seed from one source of truth.
 *
 * The same rows used to exist in three hand-maintained copies:
 * `data/long_island_zip_codes.csv` (which nothing referenced, now deleted), the
 * INSERT in `supabase/migrations/005_seed_data.sql`, and a byte-identical block in
 * `supabase/seed.sql`, which is what `supabase/config.toml` points
 * `db reset` at. A migration-only change left every locally reset database on
 * the old rows, so a test could pass or fail depending on which database it
 * hit (#772).
 *
 * `data/ny_zip_codes.csv` is now the source. This module renders the SQL from
 * it, `scripts/generate-zip-seed.ts` writes the files, and a test regenerates
 * and compares, so the copies cannot drift apart again.
 */

export interface ZipRow {
  zip: string;
  city: string;
  county: string;
  state: string;
  latitude: number;
  longitude: number;
  /**
   * Which dataset this row came from. Recorded per row rather than asserted
   * for the file as a whole, because the file is a union of two: most rows are
   * GeoNames, a handful are carried over from the launch seed because GeoNames
   * has no entry for them. Not written to the database.
   */
  source: string;
}

export const CSV_HEADER = [
  "zip",
  "city",
  "county",
  "state",
  "latitude",
  "longitude",
  "source",
] as const;

/** Columns written to public.zip_codes, in the order the INSERT lists them. */
export const TABLE_COLUMNS = [
  "zip",
  "latitude",
  "longitude",
  "city",
  "county",
  "state",
] as const;

/**
 * Parse the source CSV, refusing anything that would break the table's own
 * constraints rather than letting the migration fail on row 1,400 of 2,158.
 * `county` is NOT NULL, so a blank one has to be caught here.
 */
export function parseZipCsv(text: string): ZipRow[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("zip CSV is empty");

  const header = lines[0].split(",").map((h) => h.trim());
  if (header.join(",") !== CSV_HEADER.join(",")) {
    throw new Error(
      `zip CSV header is ${header.join(",")}, expected ${CSV_HEADER.join(",")}`,
    );
  }

  const rows: ZipRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const at = `row ${i + 1}`;
    if (cells.length !== CSV_HEADER.length) {
      throw new Error(
        `zip CSV ${at} has ${cells.length} cells, expected ${CSV_HEADER.length}: ${lines[i]}`,
      );
    }
    const [zip, city, county, state, latitude, longitude, source] = cells.map(
      (c) => c.trim(),
    );

    if (!/^\d{5}$/.test(zip)) {
      throw new Error(`zip CSV ${at} has a malformed zip: ${zip}`);
    }
    if (seen.has(zip)) {
      throw new Error(`zip CSV ${at} repeats zip ${zip}`);
    }
    seen.add(zip);

    for (const [name, value] of [
      ["city", city],
      ["county", county],
      ["state", state],
      ["source", source],
    ] as const) {
      if (value.length === 0) {
        throw new Error(`zip CSV ${at} (${zip}) has a blank ${name}`);
      }
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(
        `zip CSV ${at} (${zip}) has non-numeric coordinates: ${latitude}, ${longitude}`,
      );
    }
    // New York sits inside these bounds with room to spare. A sign flip or a
    // swapped pair, the commonest way a coordinate goes wrong, lands outside.
    if (lat < 40 || lat > 45.1 || lng < -80 || lng > -71.5) {
      throw new Error(
        `zip CSV ${at} (${zip}) has coordinates outside New York: ${lat}, ${lng}`,
      );
    }

    rows.push({
      zip,
      city,
      county,
      state,
      latitude: lat,
      longitude: lng,
      source,
    });
  }

  return rows;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function valuesTuple(row: ZipRow): string {
  return `  (${sqlString(row.zip)}, ${row.latitude.toFixed(4)}, ${row.longitude.toFixed(
    4,
  )}, ${sqlString(row.city)}, ${sqlString(row.county)}, ${sqlString(row.state)})`;
}

/**
 * The INSERT itself.
 *
 * ON CONFLICT DO NOTHING, never DO UPDATE. The 218 rows seeded at launch carry
 * hand-set coordinates, and 21 of them sit more than three miles from the
 * GeoNames centroid for the same zip. Overwriting them would move existing
 * families' saved distance searches, which is a separate decision from
 * widening coverage.
 */
export function renderInsert(rows: ZipRow[]): string {
  const sorted = [...rows].sort((a, b) => a.zip.localeCompare(b.zip));
  return [
    `INSERT INTO public.zip_codes (${TABLE_COLUMNS.join(", ")}) VALUES`,
    sorted.map(valuesTuple).join(",\n"),
    "ON CONFLICT (zip) DO NOTHING;",
  ].join("\n");
}

/**
 * A floor on the rows actually present afterwards, not a check that the
 * statement did something. With ON CONFLICT the statement count includes rows
 * it skipped, so a "did we insert anything" check can pass on a no-op and a
 * zero check can never fire. This counts what is in the table.
 */
export function renderRowCountFloor(rows: ZipRow[]): string {
  return `DO $$
DECLARE
  seeded integer;
BEGIN
  SELECT count(*) INTO seeded FROM public.zip_codes WHERE state = 'NY';
  IF seeded < ${rows.length} THEN
    RAISE EXCEPTION
      'zip_codes holds % New York rows, expected at least ${rows.length}. The seed did not land.',
      seeded;
  END IF;
END
$$;`;
}

export const MIGRATION_FILENAME = "065_seed_ny_zip_codes.sql";

export function renderMigration(rows: ZipRow[]): string {
  const geonames = rows.filter((r) => r.source === "geonames").length;
  const carried = rows.length - geonames;
  return `-- ============================================================
-- Seed the full New York zip list
-- ============================================================
--
-- GENERATED FILE. Edit data/ny_zip_codes.csv and run
--   npx tsx scripts/generate-zip-seed.ts
-- This file and the matching block in supabase/seed.sql are both rendered
-- from that CSV, so a migration-only change can no longer leave every
-- locally reset database on the old rows (#772).
--
-- Source: GeoNames postal code data (${geonames} rows), licensed CC BY 4.0.
-- Attribution ships to users on /attributions. GeoNames was chosen over the
-- Census gazetteer, which is public domain and needs no attribution, because
-- the gazetteer carries neither a county (zip_codes.county is NOT NULL) nor a
-- place name, and the place name is what the directory shows families as a
-- nurse's town.
--
-- ${carried} rows are carried over from the launch seed instead, because
-- GeoNames has no entry for them: they are PO box only or single recipient
-- zips, which postal reference datasets routinely omit. That is the shape of
-- the residual gap, measured rather than assumed: 4 of the 218 zips this
-- product had already seeded (1.8%) are absent from GeoNames. Expect a
-- comparable share of New York's PO box zips to be missing. A zip we hold no
-- coordinates for is not silently dropped from search: the page says it could
-- not locate it and ignores the distance constraint (#769).
--
-- ON CONFLICT DO NOTHING, never DO UPDATE. The 218 launch rows carry hand-set
-- coordinates and 21 of them sit more than three miles from the GeoNames
-- centroid for the same zip. Overwriting them would move existing families'
-- saved distance searches. Changing them is a separate decision.

${renderInsert(rows)}

${renderRowCountFloor(rows)}
`;
}

export const SEED_ZIP_MARKER_START = "-- BEGIN GENERATED zip_codes";
export const SEED_ZIP_MARKER_END = "-- END GENERATED zip_codes";

export function renderSeedBlock(rows: ZipRow[]): string {
  return [
    SEED_ZIP_MARKER_START,
    "-- Rendered from data/ny_zip_codes.csv by scripts/generate-zip-seed.ts.",
    "-- Do not edit by hand: supabase/config.toml points db reset at this file,",
    "-- so it and migration " + MIGRATION_FILENAME + " must agree (#772).",
    "",
    renderInsert(rows),
    "",
    SEED_ZIP_MARKER_END,
  ].join("\n");
}

/**
 * Replace the generated block inside seed.sql, leaving everything else alone.
 *
 * Throws when the markers are absent. An operation that finds its target by
 * matching text reports success when it matches nothing, and the next step
 * then acts on a state nobody created.
 */
export function replaceSeedBlock(seedSql: string, block: string): string {
  const start = seedSql.indexOf(SEED_ZIP_MARKER_START);
  const end = seedSql.indexOf(SEED_ZIP_MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `supabase/seed.sql has no ${SEED_ZIP_MARKER_START} / ${SEED_ZIP_MARKER_END} markers to replace`,
    );
  }
  if (end < start) {
    throw new Error(
      `supabase/seed.sql has ${SEED_ZIP_MARKER_END} before ${SEED_ZIP_MARKER_START}`,
    );
  }
  return (
    seedSql.slice(0, start) +
    block +
    seedSql.slice(end + SEED_ZIP_MARKER_END.length)
  );
}
