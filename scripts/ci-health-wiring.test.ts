// @vitest-environment node
//
// The counter (#818) finds its signals by ANNOTATION TITLE. Those titles are
// written in one file and read in another, and a shared name is read as
// evidence of shared behaviour, so the two sides can drift indefinitely while
// each reads as correct on its own (L263).
//
// If they drift, the counter finds nothing, reports "not judged", and the
// silence is indistinguishable from a repo nobody has pushed to. So the titles
// are compared here, both derived from source rather than written out twice.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const READER = read("scripts/check-ci-health.ts");
const REPORTER = read("e2e/flake-reporter.ts");
const PROOF = read("scripts/check-merged-tree-proof.ts");
const WORKFLOW = read(".github/workflows/ci-health.yml");

import { ANNOTATION_TITLES as TITLES } from "./ci-annotations";

/** Annotation titles a file emits, taken from the source. */
function emitted(source: string): string[] {
  return [...source.matchAll(/::notice title=\$\{ANNOTATION_TITLES\.(\w+)\}::/g)].map(
    (m) => m[1],
  );
}

describe("the annotation titles", () => {
  // One definition, imported by everything that writes one and by the counter
  // that reads them. They were three separate string literals first, which is a
  // name shared only by convention: the sides can drift indefinitely while each
  // reads as correct on its own, and the counter then finds nothing and reports
  // "not judged", which is indistinguishable from a quiet week (L263, L41).
  it("are defined in one place and nowhere else", () => {
    for (const [file, source] of [
      ["e2e/flake-reporter.ts", REPORTER],
      ["scripts/check-merged-tree-proof.ts", PROOF],
      ["scripts/check-ci-health.ts", READER],
    ] as const) {
      expect(source, `${file} does not import the shared titles`).toContain(
        "ANNOTATION_TITLES",
      );
      // No hand-written copy of a title alongside the shared one.
      expect(source, `${file} still hardcodes a title`).not.toMatch(
        /::notice title=[A-Z]/,
      );
    }
  });

  it("cover both signals the counter reads", () => {
    expect(Object.keys(TITLES).sort()).toEqual(["flakeCount", "mergedTreeProof"]);
    for (const key of Object.keys(TITLES)) {
      expect(READER, `the counter never reads ${key}`).toContain(
        `ANNOTATION_TITLES.${key}`,
      );
    }
  });

  it("the flake reporter emits one on every run, not only on flaky ones", () => {
    // Unconditional: a run with no annotation must mean the run could not
    // report, never that it was healthy (L223). The emit sits outside any
    // `if`, which is what makes the count trustworthy.
    expect(emitted(REPORTER)).toEqual(["flakeCount"]);
    const emitAt = REPORTER.indexOf("::notice title=");
    const guardAt = REPORTER.indexOf("if (summary.count > 0)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(emitAt).toBeLessThan(guardAt);
  });

  it("the merged tree proof emits one on each of its three outcomes", () => {
    const titles = emitted(PROOF);
    expect(titles.length).toBe(3);
    expect(new Set(titles)).toEqual(new Set(["mergedTreeProof"]));
  });
});

describe("the CI Health workflow", () => {
  it("runs on a schedule and can be triggered by hand", () => {
    expect(WORKFLOW).toMatch(/schedule:\s*\n\s*-\s*cron:/);
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("asks only for read access, and for the scopes it actually uses", () => {
    const block = WORKFLOW.match(/^permissions:\n(?:\s+.*\n)+/m)![0];
    expect(block).toMatch(/actions:\s*read/); // listing runs
    expect(block).toMatch(/checks:\s*read/); // their annotations
    expect(block).not.toMatch(/:\s*write/);
  });

  it("runs the counter", () => {
    expect(WORKFLOW).toContain("scripts/check-ci-health.ts");
  });
});
