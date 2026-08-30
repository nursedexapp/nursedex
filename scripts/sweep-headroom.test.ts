// @vitest-environment node
//
// The guard mutation sweep has no measured distance to its deadline (#807).
//
// 105 mutants take about 211 seconds under ci.yml's 15 minute timeout, and
// every new guard site adds about two seconds. Nothing reports that ratio, so
// the first sign of growth would be a red main run naming the timeout, which
// reads as a broken guard rather than as a sweep that outgrew its budget (L11).
//
// The budget is READ from the workflow, never written here, because a copy
// maintained beside it drifts and the drift is invisible: the number goes on
// looking like a measurement of something (L41, L210).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readJobTimeoutMinutes, checkSweepHeadroom } from "./sweep-headroom";

const CI = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

describe("readJobTimeoutMinutes", () => {
  it("reads the real budget out of ci.yml", () => {
    expect(readJobTimeoutMinutes(CI)).toBe(15);
  });

  // An unreadable timeout must not become a default, because a generous
  // default is exactly the answer that makes the check pass forever.
  it("refuses a workflow with no timeout rather than assuming one", () => {
    expect(() => readJobTimeoutMinutes("jobs:\n  ci:\n    name: x\n")).toThrow(
      /no timeout/i,
    );
  });

  it("refuses a timeout it cannot read as a number", () => {
    expect(() => readJobTimeoutMinutes("    timeout-minutes: soon\n")).toThrow(
      /timeout/i,
    );
  });
});

describe("checkSweepHeadroom", () => {
  const budget = { timeoutMinutes: 15, maxFraction: 0.5 };

  it("reports the fraction used, so every run carries the measurement", () => {
    const result = checkSweepHeadroom({ elapsedMs: 211_000, ...budget });
    expect(result.withinBudget).toBe(true);
    expect(result.fraction).toBeCloseTo(211 / 900, 3);
    expect(result.message).toContain("211");
    expect(result.message).toContain("15");
  });

  it("refuses once the sweep passes the agreed fraction of its deadline", () => {
    const result = checkSweepHeadroom({ elapsedMs: 500_000, ...budget });
    expect(result.withinBudget).toBe(false);
    expect(result.message).toMatch(/outgrow|budget|fraction/i);
  });

  // The boundary belongs to the passing side: a sweep sitting exactly on the
  // line has not exceeded it, and a check that fires there would fire on
  // rounding.
  it("treats exactly the fraction as still within budget", () => {
    expect(checkSweepHeadroom({ elapsedMs: 450_000, ...budget }).withinBudget).toBe(
      true,
    );
  });

  // A zero or negative elapsed time means the measurement failed, and a failed
  // measurement must not read as the healthiest possible result (L98).
  it("refuses an elapsed time that cannot be real", () => {
    for (const elapsedMs of [0, -1, Number.NaN]) {
      const result = checkSweepHeadroom({ elapsedMs, ...budget });
      expect(result.withinBudget, String(elapsedMs)).toBe(false);
      expect(result.message).toMatch(/not.*measur|invalid/i);
    }
  });

  it("refuses a fraction outside nought to one rather than computing nonsense", () => {
    expect(() =>
      checkSweepHeadroom({ elapsedMs: 1000, timeoutMinutes: 15, maxFraction: 2 }),
    ).toThrow(/fraction/i);
  });
});
