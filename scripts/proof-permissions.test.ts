// @vitest-environment node
//
// The merged tree proof (#812) needs three read permissions the default
// workflow token does not carry. The first main run after #812 merged reported
// `403 Resource not accessible by integration` on /commits/<sha>/pulls, so the
// proof had never once held and never could have.
//
// It failed closed and ran the full suite, which is right. What makes this
// worth a test is that nothing went red: the feature was inert and every check
// was green, and the only reason it was noticed at all is that a failed lookup
// is worded differently from a reasoned refusal (L289).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

/** Derived: any workflow that runs the proof needs the permissions for it. */
function workflowsRunningTheProof(): string[] {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".yml"))
    .filter((file) =>
      readFileSync(join(DIR, file), "utf8").includes(
        "scripts/check-merged-tree-proof.ts",
      ),
    );
}

describe("workflows that run the merged tree proof", () => {
  it("there is at least one, or this file asserts about nothing", () => {
    expect(workflowsRunningTheProof().length).toBeGreaterThan(0);
  });

  it.each(workflowsRunningTheProof())(
    "%s can read the three things the proof asks about",
    (file) => {
      const body = readFileSync(join(DIR, file), "utf8");
      const block = body.match(/^permissions:\n(?:\s+.*\n)+/m);
      expect(block, `${file} declares no permissions block`).not.toBeNull();

      // Each one answers a specific question, and a missing one is a 403 at
      // run time that reads as a proof that simply never holds.
      expect(block![0]).toMatch(/contents:\s*read/);
      expect(block![0]).toMatch(/pull-requests:\s*read/);
      expect(block![0]).toMatch(/checks:\s*read/);
    },
  );

  // An over-broad permission is invisible: the code never attempts what it is
  // not meant to do, so nothing ever reports the excess (L503). Write access
  // in particular has no business in a job that only reads.
  it.each(workflowsRunningTheProof())("%s asks for no write access", (file) => {
    const body = readFileSync(join(DIR, file), "utf8");
    const block = body.match(/^permissions:\n(?:\s+.*\n)+/m)![0];
    expect(block).not.toMatch(/:\s*write/);
    expect(block).not.toMatch(/permissions:\s*write-all/);
  });
});
