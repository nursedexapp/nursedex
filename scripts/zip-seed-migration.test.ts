import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Run the zip migrations against a real Postgres.
 *
 * These are data-repair and data-seed migrations, and both of them assert
 * something about the rows that exist afterwards. Asserting on the SQL text
 * would only prove the text says what I typed. The defect these fix was
 * invisible in the text: a carriage return inside a string literal reads as
 * 'NY' in every editor and every diff, and it was only ever going to be found
 * by counting rows in a database (#772).
 *
 * PGlite is Postgres compiled to WASM, so this is the real engine and the real
 * `ON CONFLICT`, `btrim` and `numeric(8,4)` behaviour, with no container and
 * no network.
 */

const MIGRATIONS = join("supabase", "migrations");

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.zip_codes (
  zip text PRIMARY KEY,
  city text NOT NULL,
  county text NOT NULL,
  state text NOT NULL DEFAULT 'NY',
  latitude numeric(8,4) NOT NULL,
  longitude numeric(8,4) NOT NULL
);
`;

function migration(name: string): string {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

/** The zip_codes INSERT out of migration 005, which also seeds other tables. */
function launchSeedInsert(): string {
  const sql = migration("005_seed_data.sql");
  const start = sql.indexOf("INSERT INTO public.zip_codes");
  const end = sql.indexOf(";", sql.indexOf("ON CONFLICT", start));
  if (start === -1 || end === -1) {
    throw new Error("migration 005 no longer contains a zip_codes INSERT");
  }
  return sql.slice(start, end + 1);
}

const DIRTY =
  "position(chr(13) in state) > 0 OR position(chr(13) in city) > 0 OR position(chr(13) in county) > 0";

async function count(db: PGlite, where: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.zip_codes WHERE ${where}`,
  );
  return r.rows[0].n;
}

describe("the zip migrations against a real Postgres", () => {
  let db: PGlite;
  let dirtyBefore: number;

  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(SCHEMA);
    await db.exec(launchSeedInsert());
    dirtyBefore = await count(db, DIRTY);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  // The positive control for everything below. If the launch seed were clean,
  // the repair would have nothing to prove and would pass by doing nothing.
  it("the launch seed really does store carriage returns", () => {
    expect(dirtyBefore).toBe(217);
  });

  it("the repair leaves none behind", async () => {
    await db.exec(migration("064_strip_carriage_returns_from_zip_state.sql"));
    expect(await count(db, DIRTY)).toBe(0);
  });

  it("the repaired rows are countable as New York", async () => {
    expect(await count(db, "state = 'NY'")).toBe(218);
  });

  it("the seed brings the table up to its own floor", async () => {
    await db.exec(migration("065_seed_ny_zip_codes.sql"));
    const ny = await count(db, "state = 'NY'");
    expect(ny).toBe(2158);
    // Nothing outside New York, so the floor is counting the whole table.
    expect(await count(db, "true")).toBe(ny);
  });

  it("keeps the launch rows' own coordinates rather than overwriting them", async () => {
    // 11001 is one of the 218 hand-set rows. GeoNames puts its centroid
    // somewhere else; DO NOTHING means the stored value must not move.
    const r = await db.query<{ latitude: string; longitude: string }>(
      "SELECT latitude, longitude FROM public.zip_codes WHERE zip = '11001'",
    );
    expect(r.rows[0]).toEqual({ latitude: "40.7236", longitude: "-73.7058" });
  });

  it("carries the zips GeoNames does not have", async () => {
    const r = await db.query<{ zip: string }>(
      "SELECT zip FROM public.zip_codes WHERE zip IN ('11099','11535','11536','11597') ORDER BY zip",
    );
    expect(r.rows.map((x) => x.zip)).toEqual([
      "11099",
      "11535",
      "11536",
      "11597",
    ]);
  });

  it("reaches beyond Long Island", async () => {
    // Buffalo. The old seed stopped at Nassau, Suffolk and bordering Queens.
    const r = await db.query<{ city: string; county: string }>(
      "SELECT city, county FROM public.zip_codes WHERE zip = '14201'",
    );
    expect(r.rows[0].county).toBe("Erie");
  });

  it("is safe to run twice", async () => {
    await db.exec(migration("064_strip_carriage_returns_from_zip_state.sql"));
    await db.exec(migration("065_seed_ny_zip_codes.sql"));
    expect(await count(db, "state = 'NY'")).toBe(2158);
  });
});

describe("the seed's floor", () => {
  // The floor exists to fail. Proving it fails is the only way to know it is a
  // guard rather than a comment: this ran green for a whole CI cycle while the
  // table was 217 rows short, and the floor is what caught it.
  it("raises when the rows are not there", async () => {
    const db = await PGlite.create();
    await db.exec(SCHEMA);
    await expect(
      db.exec(
        migration("065_seed_ny_zip_codes.sql").split("INSERT INTO")[0] +
          floorOnly(),
      ),
    ).rejects.toThrow(/expected at least 2158/);
    await db.close();
  }, 60_000);
});

/** The floor block on its own, with no INSERT before it. */
function floorOnly(): string {
  const sql = migration("065_seed_ny_zip_codes.sql");
  const start = sql.indexOf("DO $$");
  if (start === -1) throw new Error("migration 065 no longer has a DO block");
  return sql.slice(start);
}
