// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseMigrationList,
  detectDrift,
  formatDriftReport,
} from "./migration-drift";

// The Supabase CLI prints progress lines before the JSON payload.
const LOG_PREAMBLE = [
  "WARN: config section [inbucket] is deprecated.",
  "Initialising login role...",
  "Connecting to remote database...",
].join("\n");

function payload(migrations: unknown[]): string {
  return `${LOG_PREAMBLE}\n${JSON.stringify({
    migrations,
    message: "Migrations listed",
  })}\n`;
}

describe("parseMigrationList", () => {
  it("extracts the JSON payload from among the CLI's log lines", () => {
    const rows = parseMigrationList(
      payload([{ local: "001", remote: "001", time: "001" }]),
    );
    expect(rows).toEqual([{ local: "001", remote: "001", time: "001" }]);
  });

  it("throws when the CLI produced no JSON at all", () => {
    // A failed connection prints logs and exits; silently reporting "no drift"
    // here would be worse than useless, it would be a false all-clear.
    expect(() => parseMigrationList(LOG_PREAMBLE)).toThrow(
      /no JSON payload/i,
    );
  });

  it("throws on a malformed JSON payload", () => {
    expect(() => parseMigrationList("{ not json")).toThrow();
  });

  it("throws when the payload has no migrations array", () => {
    expect(() => parseMigrationList('{"message":"nope"}')).toThrow(
      /migrations/i,
    );
  });
});

describe("detectDrift", () => {
  it("reports no drift when every local migration is applied remotely", () => {
    const report = detectDrift([
      { local: "001", remote: "001" },
      { local: "002", remote: "002" },
    ]);
    expect(report).toEqual({ pending: [], untracked: [], hasDrift: false });
  });

  it("flags a migration that exists locally but was never pushed", () => {
    // The exact shape that let migration 053 ship a live cron writing to a
    // table that did not exist in production.
    const report = detectDrift([
      { local: "052", remote: "052" },
      { local: "053", remote: "" },
    ]);
    expect(report.pending).toEqual(["053"]);
    expect(report.hasDrift).toBe(true);
  });

  it("treats an absent remote key the same as an empty one", () => {
    const report = detectDrift([{ local: "053" }]);
    expect(report.pending).toEqual(["053"]);
    expect(report.hasDrift).toBe(true);
  });

  it("flags a migration applied to production but missing from git", () => {
    const report = detectDrift([{ local: "", remote: "099" }]);
    expect(report.untracked).toEqual(["099"]);
    expect(report.hasDrift).toBe(true);
  });

  it("reports both directions of drift at once", () => {
    const report = detectDrift([
      { local: "001", remote: "001" },
      { local: "053", remote: "" },
      { local: "", remote: "099" },
    ]);
    expect(report).toEqual({
      pending: ["053"],
      untracked: ["099"],
      hasDrift: true,
    });
  });

  it("reports no drift for an empty migration set", () => {
    expect(detectDrift([])).toEqual({
      pending: [],
      untracked: [],
      hasDrift: false,
    });
  });
});

describe("formatDriftReport", () => {
  it("names the pending migrations and how to apply them", () => {
    const msg = formatDriftReport({
      pending: ["053", "054"],
      untracked: [],
      hasDrift: true,
    });
    expect(msg).toContain("053");
    expect(msg).toContain("054");
    expect(msg).toMatch(/db push/);
  });

  it("names untracked migrations as applied but missing from git", () => {
    const msg = formatDriftReport({
      pending: [],
      untracked: ["099"],
      hasDrift: true,
    });
    expect(msg).toContain("099");
    expect(msg).toMatch(/not in git/i);
  });

  it("says so plainly when there is no drift", () => {
    const msg = formatDriftReport({
      pending: [],
      untracked: [],
      hasDrift: false,
    });
    expect(msg).toMatch(/in sync/i);
  });
});
