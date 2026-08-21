import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseZipCsv,
  renderInsert,
  renderMigration,
  renderRowCountFloor,
  renderSeedBlock,
  replaceSeedBlock,
  SEED_ZIP_MARKER_START,
  SEED_ZIP_MARKER_END,
  type ZipRow,
} from "./zip-seed";
import {
  generate,
  CSV_PATH,
  SEED_PATH,
  MIGRATION_PATH,
} from "./generate-zip-seed";

const HEADER = "zip,city,county,state,latitude,longitude,source";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n") + "\n";
}

const ONE_ROW = "11779,Ronkonkoma,Suffolk,NY,40.8151,-73.1279,geonames";

describe("parseZipCsv", () => {
  it("parses a well formed row", () => {
    const [row] = parseZipCsv(csv(ONE_ROW));
    expect(row).toEqual({
      zip: "11779",
      city: "Ronkonkoma",
      county: "Suffolk",
      state: "NY",
      latitude: 40.8151,
      longitude: -73.1279,
      source: "geonames",
    });
  });

  it("refuses an unexpected header rather than silently misreading columns", () => {
    expect(() =>
      parseZipCsv(
        "zip,latitude,longitude,city,county,state\n11779,1,2,a,b,NY\n",
      ),
    ).toThrow(/header is/);
  });

  // county is NOT NULL on the table. Catching it here names the row; letting
  // it through fails the migration partway with no idea which row did it.
  it("refuses a blank county, naming the row", () => {
    expect(() =>
      parseZipCsv(csv("11779,Ronkonkoma,,NY,40.8151,-73.1279,geonames")),
    ).toThrow(/row 2 \(11779\) has a blank county/);
  });

  it("refuses a blank city", () => {
    expect(() =>
      parseZipCsv(csv("11779,,Suffolk,NY,40.8151,-73.1279,geonames")),
    ).toThrow(/blank city/);
  });

  it("refuses a malformed zip", () => {
    expect(() =>
      parseZipCsv(csv("1177,Ronkonkoma,Suffolk,NY,40.8151,-73.1279,geonames")),
    ).toThrow(/malformed zip: 1177/);
  });

  it("refuses a repeated zip, which ON CONFLICT would hide", () => {
    expect(() => parseZipCsv(csv(ONE_ROW, ONE_ROW))).toThrow(
      /repeats zip 11779/,
    );
  });

  it("refuses non-numeric coordinates", () => {
    expect(() =>
      parseZipCsv(csv("11779,Ronkonkoma,Suffolk,NY,north,-73.1279,geonames")),
    ).toThrow(/non-numeric coordinates/);
  });

  // A swapped latitude and longitude is the commonest way a coordinate goes
  // wrong, and it lands the nurse in the Indian Ocean rather than erroring.
  it("refuses coordinates outside New York", () => {
    expect(() =>
      parseZipCsv(csv("11779,Ronkonkoma,Suffolk,NY,-73.1279,40.8151,geonames")),
    ).toThrow(/outside New York/);
  });

  it("refuses a row with the wrong number of cells", () => {
    expect(() =>
      parseZipCsv(csv("11779,Ronkonkoma,Suffolk,NY,40.8151,-73.1279")),
    ).toThrow(/has 6 cells, expected 7/);
  });
});

function rows(...zips: [string, string][]): ZipRow[] {
  return zips.map(([zip, city]) => ({
    zip,
    city,
    county: "Suffolk",
    state: "NY",
    latitude: 40.8151,
    longitude: -73.1279,
    source: "geonames",
  }));
}

describe("renderInsert", () => {
  // DO UPDATE would overwrite the 218 hand-set launch rows with centroids and
  // move existing families' saved distance searches.
  it("skips existing rows rather than overwriting them", () => {
    const sql = renderInsert(rows(["11779", "Ronkonkoma"]));
    expect(sql).toContain("ON CONFLICT (zip) DO NOTHING;");
    expect(sql).not.toContain("DO UPDATE");
  });

  it("escapes an apostrophe in a place name", () => {
    const sql = renderInsert(rows(["11779", "O'Brien Corners"]));
    expect(sql).toContain("'O''Brien Corners'");
  });

  it("writes only the table's own columns, never the source column", () => {
    const sql = renderInsert(rows(["11779", "Ronkonkoma"]));
    expect(sql).toContain(
      "INSERT INTO public.zip_codes (zip, latitude, longitude, city, county, state) VALUES",
    );
    expect(sql).not.toContain("geonames");
  });

  it("orders rows by zip so a regenerated file has a readable diff", () => {
    const sql = renderInsert(
      rows(["11980", "Yaphank"], ["11001", "Floral Park"]),
    );
    expect(sql.indexOf("'11001'")).toBeLessThan(sql.indexOf("'11980'"));
  });
});

describe("renderRowCountFloor", () => {
  // With ON CONFLICT the statement count includes rows it skipped, so a check
  // that the statement did something can pass on a complete no-op and a zero
  // check can never fire. Count what is in the table instead.
  it("asserts a floor taken from the row count, not merely non-zero", () => {
    const sql = renderRowCountFloor(rows(["11779", "A"], ["11001", "B"]));
    expect(sql).toContain("SELECT count(*) INTO seeded FROM public.zip_codes");
    expect(sql).toContain("IF seeded < 2 THEN");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).not.toContain("> 0");
  });
});

describe("replaceSeedBlock", () => {
  it("replaces only the marked block", () => {
    const seed = `before\n${SEED_ZIP_MARKER_START}\nold\n${SEED_ZIP_MARKER_END}\nafter\n`;
    const out = replaceSeedBlock(seed, "NEW");
    expect(out).toBe("before\nNEW\nafter\n");
  });

  // An operation that finds its target by matching text reports success when
  // it matches nothing, and the next step acts on a state nobody created.
  it("throws when the markers are missing rather than silently doing nothing", () => {
    expect(() => replaceSeedBlock("no markers here", "NEW")).toThrow(
      /has no .* markers to replace/,
    );
  });

  it("throws when the markers are the wrong way round", () => {
    const seed = `${SEED_ZIP_MARKER_END}\n${SEED_ZIP_MARKER_START}`;
    expect(() => replaceSeedBlock(seed, "NEW")).toThrow(/before/);
  });
});

describe("the committed zip seed", () => {
  const csvText = readFileSync(CSV_PATH, "utf8");
  const parsed = parseZipCsv(csvText);

  it("covers the whole state, not just Long Island", () => {
    // New York has 62 counties. Anything materially short of that means the
    // source was filtered somewhere it should not have been.
    const counties = new Set(parsed.map((r) => r.county));
    expect(counties.size).toBe(62);
    expect(parsed.length).toBeGreaterThan(2000);
  });

  // These four have no GeoNames entry. They were in the launch seed, so
  // dropping them would take coverage away while the row count went up.
  it("keeps the launch-seed zips GeoNames does not carry", () => {
    const carried = parsed.filter((r) => r.source !== "geonames");
    expect(carried.map((r) => r.zip).sort()).toEqual([
      "11099",
      "11535",
      "11536",
      "11597",
    ]);
  });

  it("still holds every zip the launch seed held", () => {
    const zips = new Set(parsed.map((r) => r.zip));
    for (const zip of ["11001", "11779", "11980", "11099"]) {
      expect(zips.has(zip), `${zip} dropped from the seed`).toBe(true);
    }
  });

  // The three copies of this list drifting apart is the whole defect. seed.sql
  // is what `supabase db reset` loads, so a migration-only change would leave
  // every local database on the old rows.
  it("matches what the CSV renders, in both the migration and seed.sql", () => {
    const generated = generate(csvText, readFileSync(SEED_PATH, "utf8"));
    expect(readFileSync(MIGRATION_PATH, "utf8")).toBe(generated.migration);
    expect(readFileSync(SEED_PATH, "utf8")).toBe(generated.seedSql);
  });

  it("counts rows the repair migration has made countable", () => {
    // 217 launch rows hold a state of "NY" plus a carriage return, so a
    // state = 'NY' count misses them. Migration 064 trims them; this floor is
    // only reachable because it runs first.
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toContain("WHERE state = 'NY'");
    expect(MIGRATION_PATH).toContain("065_");
  });

  it("names its license and where the attribution ships", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toContain("CC BY 4.0");
    expect(migration).toContain("/attributions");
  });

  it("states the residual gap rather than implying full coverage", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toMatch(/PO box/);
  });
});

describe("renderMigration", () => {
  it("carries the insert and the floor together", () => {
    const sql = renderMigration(rows(["11779", "Ronkonkoma"]));
    expect(sql).toContain("ON CONFLICT (zip) DO NOTHING;");
    expect(sql).toContain("IF seeded < 1 THEN");
  });

  it("says it is generated and how to regenerate it", () => {
    const sql = renderMigration(rows(["11779", "Ronkonkoma"]));
    expect(sql).toContain("GENERATED FILE");
    expect(sql).toContain("scripts/generate-zip-seed.ts");
  });
});

describe("generate", () => {
  // A generator that answers "stale, rewriting" for a file it could not read
  // would overwrite it. Absent is a first run; unreadable is a fault.
  it("renders both artifacts from one parse of the CSV", () => {
    const seed = `x\n${SEED_ZIP_MARKER_START}\nold\n${SEED_ZIP_MARKER_END}\ny\n`;
    const out = generate(csv(ONE_ROW), seed);
    expect(out.migration).toContain("'11779'");
    expect(out.seedSql).toContain("'11779'");
    expect(out.seedSql).toContain("x\n");
    expect(out.seedSql).toContain("y\n");
  });

  it("refuses to render anything when the CSV is bad", () => {
    const seed = `${SEED_ZIP_MARKER_START}\n${SEED_ZIP_MARKER_END}`;
    expect(() =>
      generate(csv("11779,Ronkonkoma,,NY,40.8151,-73.1279,geonames"), seed),
    ).toThrow(/blank county/);
  });
});

describe("renderSeedBlock", () => {
  it("is wrapped in the markers the replacer looks for", () => {
    const block = renderSeedBlock(rows(["11779", "Ronkonkoma"]));
    expect(block.startsWith(SEED_ZIP_MARKER_START)).toBe(true);
    expect(block.trimEnd().endsWith(SEED_ZIP_MARKER_END)).toBe(true);
  });
});
