import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  zipsNeedingCorrection,
  summariseZips,
  readAllZips,
  readReference,
  applyCorrections,
} from "./zip-coordinates-drift";

/**
 * 218 zips were seeded by hand at launch and deliberately left alone when the
 * full reference list arrived, so overwriting them would not move the results
 * of searches families had already saved (#797).
 *
 * Distance now orders the directory, so a zip placed in the wrong town puts
 * every nurse in it in the wrong place. Measured against production on
 * 2026-09-03: 21 sit more than three miles from the reference, the worst 41.6
 * miles out, and exactly two people live in any of them.
 */
const CORRECTION_MILES = 3;

const stored = (zip: string, latitude: number, longitude: number) => ({
  zip,
  latitude,
  longitude,
});
const reference = stored;

describe("zipsNeedingCorrection", () => {
  it("leaves a zip that already agrees with the reference", () => {
    const found = zipsNeedingCorrection(
      [stored("11779", 40.81, -73.12)],
      new Map([["11779", reference("11779", 40.81, -73.12)]]),
      CORRECTION_MILES,
    );
    expect(found).toEqual([]);
  });

  it("leaves a zip that disagrees by less than the threshold", () => {
    // A small shift moves nobody meaningfully, and moving it would shift a
    // saved search for no benefit.
    const found = zipsNeedingCorrection(
      [stored("11779", 40.81, -73.12)],
      new Map([["11779", reference("11779", 40.82, -73.13)]]),
      CORRECTION_MILES,
    );
    expect(found).toEqual([]);
  });

  it("finds a zip that is badly out", () => {
    const found = zipsNeedingCorrection(
      [stored("11775", 40.79, -73.41)],
      new Map([["11775", reference("11775", 40.68, -74.2)]]),
      CORRECTION_MILES,
    );
    expect(found).toHaveLength(1);
    expect(found[0].zip).toBe("11775");
    expect(found[0].miles).toBeGreaterThan(CORRECTION_MILES);
  });

  it("skips a zip the reference has never heard of", () => {
    // Four rows are carried over from the launch seed precisely because the
    // reference has no entry for them. Treating a missing reference as an
    // error would refuse the whole run over rows nobody can correct.
    const found = zipsNeedingCorrection(
      [stored("00501", 40.81, -73.04)],
      new Map(),
      CORRECTION_MILES,
    );
    expect(found).toEqual([]);
  });
});

describe("summariseZips", () => {
  it("says how far out the worst one is", () => {
    const text = summariseZips([
      { zip: "11775", miles: 41.6, latitude: 1, longitude: 2 },
      { zip: "11707", miles: 40.1, latitude: 3, longitude: 4 },
    ]);
    expect(text).toContain("2");
    expect(text).toContain("41.6");
  });

  it("says plainly when nothing needs moving", () => {
    expect(summariseZips([])).toMatch(/no zip/i);
  });
});

// ── Reading the whole list, and writing back ──────────────────
//
// The read and the write take their fetch as an argument. A script that
// builds its own cannot be tested without a network, so the part that decides
// whether the list is complete, and the part that decides whether a run
// succeeded, would be the two parts nobody ever exercises.
type FetchLike = typeof fetch;

function pagedFetch(pages: ZipPointJson[][], total: string | null): FetchLike {
  let call = 0;
  return (async () => {
    const page = pages[call++] ?? [];
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: total === null ? {} : { "content-range": `0-0/${total}` },
    });
  }) as FetchLike;
}

interface ZipPointJson {
  zip: string;
  latitude: number;
  longitude: number;
}

const zip = (z: string): ZipPointJson => ({
  zip: z,
  latitude: 40,
  longitude: -73,
});

describe("readAllZips", () => {
  it("keeps asking until it has the whole list", async () => {
    const rows = await readAllZips({
      fetchFn: pagedFetch([[zip("a"), zip("b")], [zip("c")]], "3"),
      url: "https://db.test",
      headers: {},
      pageSize: 2,
    });
    expect(rows.map((r) => r.zip)).toEqual(["a", "b", "c"]);
  });

  it("refuses a list it only partly read", async () => {
    // The server says there are more than arrived. Correcting a partial list
    // would report success and leave the rest wrong.
    await expect(
      readAllZips({
        fetchFn: pagedFetch([[zip("a")]], "99"),
        url: "https://db.test",
        headers: {},
        pageSize: 2,
      }),
    ).rejects.toThrow(/partial/i);
  });

  it("refuses when the server will not say how many there are", async () => {
    await expect(
      readAllZips({
        fetchFn: pagedFetch([[zip("a")]], null),
        url: "https://db.test",
        headers: {},
        pageSize: 2,
      }),
    ).rejects.toThrow(/no count|partial/i);
  });

  /**
   * The header can be present and still say nothing usable. PostgREST answers
   * "*" when it did not count, and a value parsed straight into a comparison
   * lands on the permissive side when the parse fails: "*" and a non-numeric
   * count both become NaN, which compares unequal to the row count, and 0
   * would make an empty read look complete (L50).
   *
   * Both reads here now go through one parser, so these cases and the profile
   * read's cannot answer differently.
   */
  it.each([
    ["a count of *", "*"],
    ["a count that is not a number", "many"],
    ["a fractional count", "2.5"],
  ])("refuses %s rather than reading it as complete", async (_label, total) => {
    await expect(
      readAllZips({
        fetchFn: pagedFetch([[zip("a")]], total),
        url: "https://db.test",
        headers: {},
        pageSize: 2,
      }),
    ).rejects.toThrow(/no count|partial/i);
  });

  it("accepts a count that does match, so the refusals above are not blanket", async () => {
    const rows = await readAllZips({
      fetchFn: pagedFetch([[zip("a")]], "1"),
      url: "https://db.test",
      headers: {},
      pageSize: 2,
    });
    expect(rows).toHaveLength(1);
  });

  it("refuses a failed read rather than treating it as an empty list", async () => {
    const failing = (async () =>
      new Response("nope", { status: 500 })) as FetchLike;
    await expect(
      readAllZips({
        fetchFn: failing,
        url: "https://db.test",
        headers: {},
        pageSize: 2,
      }),
    ).rejects.toThrow(/read failed/i);
  });
});

describe("applyCorrections", () => {
  const correction = {
    zip: "11775",
    latitude: 40.8,
    longitude: -73.4,
    miles: 41.6,
  };

  it("reports how many it moved", async () => {
    const ok = (async () => new Response("{}", { status: 200 })) as FetchLike;
    const moved = await applyCorrections({
      fetchFn: ok,
      url: "https://db.test",
      headers: {},
      corrections: [correction, { ...correction, zip: "11707" }],
    });
    expect(moved).toBe(2);
  });

  it("counts a row it could not move rather than counting it as moved", async () => {
    // Reporting 21 of 21 while one silently failed is the claim this whole
    // script exists to be able to make honestly.
    let call = 0;
    const flaky = (async () =>
      new Response("{}", { status: call++ === 0 ? 200 : 500 })) as FetchLike;
    const moved = await applyCorrections({
      fetchFn: flaky,
      url: "https://db.test",
      headers: {},
      corrections: [correction, { ...correction, zip: "11707" }],
    });
    expect(moved).toBe(1);
  });
});

/**
 * A coordinate that will not parse becomes NaN, the distance to it is NaN, and
 * NaN compares false against the threshold, so the zip would be silently
 * declared fine and never reported. The failure lands on the permissive side
 * with nothing raised (L50), which is the one direction this check cannot
 * afford, so the reference read refuses it.
 */
describe("a reference row whose coordinates are not numbers", () => {
  const write = (body: string) => {
    const file = join(tmpdir(), `zip-ref-${Math.random().toString(36)}.csv`);
    writeFileSync(file, body);
    return file;
  };

  it("is refused rather than stored as NaN", () => {
    const file = write(
      "zip,latitude,longitude\n10001,40.75,-73.99\n10002,not-a-number,-73.98\n",
    );

    expect(() => readReference(file)).toThrow(/not numbers/i);
  });

  it("names the line and the zip, so the row can be found", () => {
    const file = write(
      "zip,latitude,longitude\n10001,40.75,-73.99\n10002,,-73.98\n",
    );

    expect(() => readReference(file)).toThrow(/10002/);
  });

  it("reads a well formed list", () => {
    // The positive control: without it the refusal above could be satisfied by
    // a reader that throws on everything.
    const file = write("zip,latitude,longitude\n10001,40.75,-73.99\n");

    expect(readReference(file).get("10001")).toEqual({
      zip: "10001",
      latitude: 40.75,
      longitude: -73.99,
    });
  });
});
