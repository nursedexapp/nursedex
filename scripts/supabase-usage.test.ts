// @vitest-environment node
//
// How close production is to the usage its plan includes (#746).
//
// The organization runs Pro with the spend cap ON. That trades cost certainty
// for availability: going past the included usage does not produce a bill, it
// restricts the project. The failure then arrives as the database refusing
// writes, which surfaces to people as saves failing across the whole product
// and names nothing about the cause.
//
// Supabase's public Management API exposes no usage, quota or billing endpoint
// (its full spec, checked 2026-09-01, has 115 paths and none of them are
// billing), so this measures the two dimensions the database can be asked
// about directly and says plainly which ones it cannot see.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_INCLUDED,
  USAGE_WARNING_FRACTION,
  parseUsageRows,
  evaluateUsage,
  formatUsageReport,
  runUsageCheck,
} from "./supabase-usage";

const GB = 1024 ** 3;

describe("parseUsageRows", () => {
  it("reads the two byte counts out of the query's one row", () => {
    const usage = parseUsageRows(
      JSON.stringify([{ database_bytes: 1234, storage_bytes: 5678 }]),
    );
    expect(usage).toEqual({ databaseBytes: 1234, storageBytes: 5678 });
  });

  // The CLI prints progress lines before the JSON, exactly as the other
  // production checks have to cope with.
  it("finds the payload among the CLI's log lines", () => {
    const raw = [
      "Connecting to remote database...",
      JSON.stringify([{ database_bytes: 10, storage_bytes: 20 }]),
    ].join("\n");
    expect(parseUsageRows(raw).databaseBytes).toBe(10);
  });

  /**
   * A query that never ran must fail the job, never report a healthy amount of
   * headroom on a production nobody actually looked at (L98).
   */
  it("throws on an empty payload rather than reporting headroom", () => {
    expect(() => parseUsageRows("")).toThrow(/did not run|empty/i);
  });

  it("throws when the row holds no numbers", () => {
    expect(() =>
      parseUsageRows(JSON.stringify([{ database_bytes: null }])),
    ).toThrow(/could not be read/i);
  });

  /**
   * Postgres returns bigint as a string over JSON, and "9000000000" > 8e9 is
   * false as a string comparison while being true as a number. A size compared
   * as text would sit quietly under every threshold (L50).
   */
  it("reads a bigint that arrived as a string", () => {
    const usage = parseUsageRows(
      JSON.stringify([
        { database_bytes: "9000000000", storage_bytes: "1000" },
      ]),
    );
    expect(usage.databaseBytes).toBe(9_000_000_000);
  });
});

describe("evaluateUsage", () => {
  it("is quiet well inside the included usage", () => {
    const result = evaluateUsage({ databaseBytes: 50 * 1024 ** 2, storageBytes: 0 });
    expect(result.over).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("names the database when it passes the warning fraction", () => {
    const result = evaluateUsage({
      databaseBytes: PLAN_INCLUDED.databaseBytes * 0.9,
      storageBytes: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.over.map((o) => o.name)).toEqual(["database"]);
  });

  it("names file storage on its own quota, not the database's", () => {
    const result = evaluateUsage({
      // Larger than the whole database allowance, and still a fraction of the
      // storage one: judged against its own limit or this reads as a crisis.
      databaseBytes: 0,
      storageBytes: 20 * GB,
    });

    expect(result.ok).toBe(true);
  });

  it("names both when both are close", () => {
    const result = evaluateUsage({
      databaseBytes: PLAN_INCLUDED.databaseBytes * 0.95,
      storageBytes: PLAN_INCLUDED.storageBytes * 0.95,
    });

    expect(result.over.map((o) => o.name).sort()).toEqual([
      "database",
      "file storage",
    ]);
  });

  it("leaves headroom below the limit rather than firing at it", () => {
    expect(USAGE_WARNING_FRACTION).toBeGreaterThan(0.5);
    expect(USAGE_WARNING_FRACTION).toBeLessThan(1);
  });
});

describe("formatUsageReport", () => {
  it("prints what it measured even when everything is fine", () => {
    // The numbers are the point on a healthy run too: the first readings are
    // what any future threshold gets calibrated against (L172).
    const report = formatUsageReport(
      evaluateUsage({ databaseBytes: 300 * 1024 ** 2, storageBytes: 12 * 1024 ** 2 }),
    );

    expect(report).toMatch(/database/i);
    expect(report).toMatch(/300/);
    expect(report).toMatch(/8(\.0)? GB/);
  });

  it("says what going over would do, not just that it is close", () => {
    const report = formatUsageReport(
      evaluateUsage({
        databaseBytes: PLAN_INCLUDED.databaseBytes * 0.92,
        storageBytes: 0,
      }),
    );

    expect(report).toMatch(/read only|restrict/i);
  });

  /**
   * The two dimensions this cannot see are named on every run. A report that
   * listed only what it measured would read as a full picture of the account's
   * headroom, and the cap can bind on egress with the database half empty
   * (L11: a message may claim only what its check actually measured).
   */
  it("names the dimensions it cannot measure", () => {
    const report = formatUsageReport(
      evaluateUsage({ databaseBytes: 1, storageBytes: 1 }),
    );

    expect(report).toMatch(/egress/i);
    expect(report).toMatch(/active users/i);
  });
});

describe("the usage query", () => {
  const SQL = readFileSync(
    join(process.cwd(), "scripts/supabase-usage.sql"),
    "utf8",
  );
  const EXECUTABLE = SQL.split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  /**
   * The parser reads two aliases by name. If the query renames one, the parser
   * sees undefined, and undefined has to fail rather than read as zero usage,
   * which is why parseUsageRows throws on it. This catches the rename itself.
   */
  it("returns the two columns the parser reads", () => {
    expect(EXECUTABLE).toMatch(/as database_bytes/);
    expect(EXECUTABLE).toMatch(/as storage_bytes/);
  });

  // Aimed at production. If it can write, it is not safe to point at
  // production, and nobody should trust it enough to run it daily.
  it("only reads", () => {
    expect(EXECUTABLE).not.toMatch(/\b(insert|update|delete|drop|alter|create)\b/i);
  });
});

describe("runUsageCheck", () => {
  const HEALTHY = JSON.stringify([
    { database_bytes: 40 * 1024 ** 2, storage_bytes: 1024 },
  ]);
  const TIGHT = JSON.stringify([
    { database_bytes: PLAN_INCLUDED.databaseBytes * 0.95, storage_bytes: 0 },
  ]);

  function spyAnnounce() {
    const calls: Array<{ title: string; report: string }> = [];
    return {
      calls,
      impl: async (args: { title: string; report: string }) => {
        calls.push(args);
      },
    };
  }

  it("stays quiet and exits zero when there is headroom", async () => {
    const announce = spyAnnounce();
    const log: string[] = [];

    const code = await runUsageCheck({
      raw: HEALTHY,
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: (m) => log.push(m),
    });

    expect(code).toBe(0);
    expect(announce.calls).toHaveLength(0);
    // Still printed: the early readings are what a future threshold gets
    // calibrated against, and a check that only speaks when unhappy leaves
    // nothing to calibrate from.
    expect(log.join("\n")).toMatch(/database/i);
  });

  it("alerts and exits non zero when the allowance is running out", async () => {
    const announce = spyAnnounce();

    const code = await runUsageCheck({
      raw: TIGHT,
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
    });

    expect(code).toBe(1);
    expect(announce.calls[0].title).toMatch(/usage/i);
    expect(announce.calls[0].report).toMatch(/database/i);
  });

  /**
   * A check that could not run and an account that is running out of room are
   * different failures with different remedies, and the first must never be
   * reported as headroom (L98, L11).
   */
  it("alerts in its own words when it could not measure anything", async () => {
    const announce = spyAnnounce();

    const code = await runUsageCheck({
      raw: "Connecting to remote database...\nfailed to connect",
      announceImpl: announce.impl,
      token: "xoxb-test",
      log: () => {},
    });

    expect(code).toBe(1);
    expect(announce.calls[0].title).toMatch(/could not run/i);
    expect(announce.calls[0].title).not.toMatch(/approaching/i);
  });

  // The finding is what matters. An alerter that throws would take down the
  // run that found it before it could report.
  it("still exits non zero when the alert itself fails", async () => {
    const log: string[] = [];

    const code = await runUsageCheck({
      raw: TIGHT,
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
