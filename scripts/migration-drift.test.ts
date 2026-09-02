// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseMigrationList,
  detectDrift,
  formatDriftReport,
  runDriftCheck,
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

/**
 * The alert path (#816).
 *
 * Until this existed, a drift failure was a red job in the Actions tab and
 * nothing else. That is the same shape as the gap the check was written to
 * close: migration 043 sat merged and unapplied in production for weeks
 * because nothing said so (#518). A signal only visible to somebody who goes
 * looking is not a signal (L13).
 */
describe("runDriftCheck", () => {
  const IN_SYNC = payload([{ local: "001", remote: "001", time: "001" }]);
  const DRIFTED = payload([{ local: "043", remote: null, time: "043" }]);

  function spyAnnounce() {
    const calls: Array<{ title: string; report: string }> = [];
    return {
      calls,
      impl: async (args: { title: string; report: string }) => {
        calls.push(args);
      },
    };
  }

  it("stays quiet and exits zero when production is in sync", async () => {
    const announce = spyAnnounce();
    const log: string[] = [];

    const code = await runDriftCheck({
      raw: IN_SYNC,
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: (m) => log.push(m),
    });

    expect(code).toBe(0);
    expect(announce.calls).toHaveLength(0);
    expect(log.join("\n")).toMatch(/in sync/i);
  });

  it("posts the drift report and exits non zero when a migration is unapplied", async () => {
    const announce = spyAnnounce();

    const code = await runDriftCheck({
      raw: DRIFTED,
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
    });

    expect(code).toBe(1);
    expect(announce.calls).toHaveLength(1);
    expect(announce.calls[0].title).toMatch(/drift/i);
    expect(announce.calls[0].report).toContain("043");
  });

  /**
   * A check that could not run and a check that found drift are different
   * failures, and the remedy for each is different: one is a broken job, the
   * other is an unapplied migration. Sharing one message would send whoever
   * reads it to look for a migration that is fine (L11).
   */
  it("alerts with its own wording when the payload is unreadable", async () => {
    const announce = spyAnnounce();

    const code = await runDriftCheck({
      raw: "Connecting to remote database...\nfailed to connect",
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
    });

    expect(code).toBe(1);
    expect(announce.calls).toHaveLength(1);
    expect(announce.calls[0].title).toMatch(/could not run/i);
    expect(announce.calls[0].title).not.toMatch(/drift detected/i);
    expect(announce.calls[0].report).toMatch(/no JSON payload/i);
  });

  /**
   * The drift is the thing that matters. An alerter that throws would take the
   * job down before it printed the finding it was reporting on.
   */
  it("still exits non zero when the alert itself fails", async () => {
    const log: string[] = [];

    const code = await runDriftCheck({
      raw: DRIFTED,
      announceImpl: async () => {
        throw new Error("slack unreachable");
      },
      token: "xoxb-test",
      log: (m) => log.push(m),
    });

    expect(code).toBe(1);
    expect(log.join("\n")).toContain("slack unreachable");
  });
});
