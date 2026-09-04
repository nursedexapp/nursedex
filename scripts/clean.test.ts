import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { planClean, runClean, formatCleanReport, CLEAN_TARGETS } from "./clean";

let root: string;

function seed(relative: string, bytes: number) {
  const dir = join(root, relative);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "blob.bin"), Buffer.alloc(bytes));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nursedex-clean-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("planClean", () => {
  it("measures a target that is there", () => {
    seed(".next/dev/cache", 4096);
    const plan = planClean(root, [".next"]);

    expect(plan).toHaveLength(1);
    expect(plan[0].present).toBe(true);
    expect(plan[0].bytes).toBeGreaterThanOrEqual(4096);
  });

  // A target that was never there and a target that was removed must not read
  // the same, or "nothing to clean" and "cleaned everything" become one
  // outcome.
  it("reports a target that is absent as absent, not as zero bytes cleaned", () => {
    const plan = planClean(root, [".next"]);

    expect(plan).toHaveLength(1);
    expect(plan[0].present).toBe(false);
    expect(plan[0].bytes).toBe(0);
  });

  it("measures each target separately", () => {
    seed(".next", 2048);
    seed("node_modules/.cache/eslint", 1024);
    const plan = planClean(root, [".next", "node_modules/.cache/eslint"]);

    expect(plan.map((t) => t.target)).toEqual([
      ".next",
      "node_modules/.cache/eslint",
    ]);
    expect(plan.every((t) => t.present)).toBe(true);
  });
});

describe("runClean", () => {
  it("removes what it measured", () => {
    seed(".next/dev/cache", 4096);
    const result = runClean(root, [".next"], { dryRun: false });

    expect(existsSync(join(root, ".next"))).toBe(false);
    expect(result.removed).toHaveLength(1);
    expect(result.freedBytes).toBeGreaterThanOrEqual(4096);
  });

  it("removes nothing on a dry run, and says what it would have removed", () => {
    seed(".next/dev/cache", 4096);
    const result = runClean(root, [".next"], { dryRun: true });

    expect(existsSync(join(root, ".next"))).toBe(true);
    expect(result.removed).toHaveLength(1);
    expect(result.freedBytes).toBeGreaterThanOrEqual(4096);
  });

  it("does not count an absent target as freed space", () => {
    const result = runClean(root, [".next"], { dryRun: false });

    expect(result.removed).toHaveLength(0);
    expect(result.freedBytes).toBe(0);
  });

  // Removing a target the caller named that sits outside the root would be a
  // path traversal by another name, and this runs with a person's shell.
  it("refuses a target that escapes the root", () => {
    expect(() => runClean(root, ["../elsewhere"], { dryRun: true })).toThrow(
      /outside/i,
    );
    expect(() => runClean(root, ["/etc"], { dryRun: true })).toThrow(
      /outside/i,
    );
  });
});

describe("formatCleanReport", () => {
  it("names what it removed and how much it freed", () => {
    seed(".next", 4096);
    const report = formatCleanReport(runClean(root, [".next"], { dryRun: false }));

    expect(report).toContain(".next");
    expect(report).toMatch(/freed/i);
  });

  it("says plainly when there was nothing to remove", () => {
    const report = formatCleanReport(runClean(root, [".next"], { dryRun: false }));

    expect(report).toMatch(/nothing to remove/i);
  });

  it("marks a dry run as a dry run, so it cannot read as work done", () => {
    seed(".next", 4096);
    const report = formatCleanReport(runClean(root, [".next"], { dryRun: true }));

    expect(report).toMatch(/dry run/i);
    expect(report).toMatch(/would/i);
  });
});

describe("what npm run clean removes", () => {
  it("is a documented list, not folklore", () => {
    const doc = readFileSync("CONTRIBUTING.md", "utf8");

    expect(doc).toContain("npm run clean");
    for (const target of CLEAN_TARGETS) {
      // The doc names each cache in prose rather than by path, so match on the
      // part of the path that identifies it.
      const name = target.split("/").pop()!.replace(/^\./, "");
      expect(
        doc.toLowerCase(),
        `CONTRIBUTING.md does not mention ${target}`,
      ).toContain(name.toLowerCase());
    }
  });
});
