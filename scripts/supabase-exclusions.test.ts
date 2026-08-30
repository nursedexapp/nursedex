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
import { parseAcceptedExclusions, checkExclusions } from "./supabase-exclusions";

// Copied from `supabase start --help` on CLI 2.75.0. The real shape, not one
// invented to make the parser pass (L48).
const HELP = `Start containers for Supabase local development

Usage:
  supabase start [flags]

Flags:
  -x, --exclude strings       Names of containers to not start. [gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor]
  -h, --help                  help for start
`;

describe("parseAcceptedExclusions", () => {
  it("reads the names the CLI itself lists", () => {
    const accepted = parseAcceptedExclusions(HELP);
    expect(accepted).toContain("studio");
    expect(accepted).toContain("postgres-meta");
    expect(accepted).toContain("edge-runtime");
    expect(accepted).toHaveLength(13);
  });

  // If the CLI changes its help format, an empty list would make every name
  // look invalid, or a permissive parser would make every name look valid.
  // Either way the answer must be a refusal, not a guess (L215).
  it("refuses help text it cannot find the list in", () => {
    expect(() => parseAcceptedExclusions("no flags here")).toThrow(/could not/i);
  });

  it("refuses an empty list rather than reporting no accepted names", () => {
    expect(() =>
      parseAcceptedExclusions("  -x, --exclude strings   Names. []"),
    ).toThrow(/empty|no names/i);
  });
});

describe("checkExclusions", () => {
  const accepted = parseAcceptedExclusions(HELP);

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
    expect(checkExclusions(wanted, accepted)).toEqual(wanted);
  });

  // The whole reason this file exists.
  it("refuses a name the CLI does not accept, and names it", () => {
    expect(() => checkExclusions(["studio", "realtimee"], accepted)).toThrow(
      /realtimee/,
    );
  });

  it("names every unaccepted entry, not just the first", () => {
    let message = "";
    try {
      checkExclusions(["nope", "alsonope"], accepted);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("nope");
    expect(message).toContain("alsonope");
  });

  // Excluding storage would break nurse photos and blog images, and excluding
  // the database or its API would break everything. A future edit that adds one
  // of these must not be waved through just because the CLI accepts the name:
  // the CLI accepting it is exactly what makes it dangerous.
  it("refuses services the suite genuinely uses, even though the CLI accepts them", () => {
    for (const needed of ["storage-api", "kong", "postgrest", "gotrue", "imgproxy"]) {
      expect(() => checkExclusions([needed], accepted), needed).toThrow(
        /the suite uses/i,
      );
    }
  });

  it("refuses an empty exclusion list rather than silently excluding nothing", () => {
    expect(() => checkExclusions([], accepted)).toThrow(/nothing to exclude/i);
  });

  it("refuses a duplicate rather than quietly deduplicating it", () => {
    expect(() => checkExclusions(["studio", "studio"], accepted)).toThrow(
      /twice|duplicate/i,
    );
  });
});
