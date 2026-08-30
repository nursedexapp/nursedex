// @vitest-environment node
//
// `supabase start` pulls twelve Docker images cold on every E2E run, about 115
// seconds of a 121 to 167 second step. Seven are for services the suite never
// reaches (#802).
//
// The hazard is not the exclusion, it is the flag. `--exclude` is a cobra
// string slice, which does NOT validate its values: an unknown name is
// silently ignored, so a typo, or a service the CLI later renames, excludes
// nothing, costs the same 115 seconds, and looks exactly like this working
// (L100, L320). These tests are about catching that.
import { describe, it, expect } from "vitest";
import { checkExclusions, countRunningServices } from "./supabase-exclusions";

describe("checkExclusions", () => {
  it("passes the seven services the e2e suite never reaches", () => {
    const wanted = [
      "studio",
      "logflare",
      "vector",
      "edge-runtime",
      "realtime",
      "mailpit",
      "postgres-meta",
    ];
    expect(checkExclusions(wanted)).toEqual(wanted);
  });

  // Excluding storage would break nurse photos and blog images, and excluding
  // the database or its API would break everything. A future edit that adds one
  // of these must not be waved through just because the CLI accepts the name:
  // the CLI accepting it is exactly what makes it dangerous.
  it("refuses services the suite genuinely uses, even though the CLI accepts them", () => {
    for (const needed of ["storage-api", "kong", "postgrest", "gotrue", "imgproxy"]) {
      expect(() => checkExclusions([needed]), needed).toThrow(
        /the suite uses/i,
      );
    }
  });

  it("refuses an empty exclusion list rather than silently excluding nothing", () => {
    expect(() => checkExclusions([])).toThrow(/nothing to exclude/i);
  });

  it("refuses a duplicate rather than quietly deduplicating it", () => {
    expect(() => checkExclusions(["studio", "studio"])).toThrow(
      /twice|duplicate/i,
    );
  });
});

describe("countRunningServices", () => {
  // The real guard. --exclude silently ignores a name it does not know, so the
  // only trustworthy answer is what ended up running.
  const bounds = { atLeast: 3, atMost: 7 };
  const FIVE = [
    "supabase_db_nursedex",
    "supabase_kong_nursedex",
    "supabase_auth_nursedex",
    "supabase_rest_nursedex",
    "supabase_storage_nursedex",
  ].join("\n");

  it("accepts the count the exclusions should leave, and reports it", () => {
    const result = countRunningServices(FIVE, bounds);
    expect(result.count).toBe(5);
    expect(result.message).toContain("supabase_kong_nursedex");
  });

  it("refuses when more are running than the exclusions should have left", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `supabase_s${i}`).join("\n");
    expect(() => countRunningServices(twelve, bounds)).toThrow(/more than/i);
  });

  // A filter that matches nothing would otherwise read as the most successful
  // exclusion possible (L98).
  it("refuses an empty answer rather than reading it as everything excluded", () => {
    expect(() => countRunningServices("", bounds)).toThrow(/did not come up|fewer than/i);
  });

  it("refuses a count below the floor, which means it is counting the wrong thing", () => {
    expect(() => countRunningServices("supabase_db_x\nsupabase_kong_x", bounds)).toThrow(
      /fewer than/i,
    );
  });

  it("names what it found, so a wrong count can be diagnosed without a rerun", () => {
    let message = "";
    try {
      countRunningServices("supabase_only_one", bounds);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("supabase_only_one");
  });

  it("ignores blank lines, which is how docker ps ends its output", () => {
    expect(countRunningServices(`${FIVE}\n\n`, bounds).count).toBe(5);
  });
});
