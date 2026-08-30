// @vitest-environment node
//
// Cancelling a superseded run is right on a branch and wrong on main (#807).
//
// The full guard mutation sweep runs ONLY on a push to main, so a second merge
// inside the 6.5 minute window cancelled the first merge's sweep, and a mutant
// that survived on that commit was reported nowhere at all: a cancelled run
// looks like a run that was never needed (L98).
//
// Since #801 the consequence is larger than a lost report. Production waits for
// these jobs (#817), so a cancelled main run strands a merge as a deployment
// nothing ever promotes, which is exactly the silent failure that change has to
// avoid.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

/** Derived from the directory, so a sixth workflow is covered by construction. */
function workflowsTriggeredByPushToMain(): Array<{ file: string; body: string }> {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".yml"))
    .map((file) => ({ file, body: readFileSync(join(DIR, file), "utf8") }))
    .filter(({ body }) => /push:\s*\n\s*branches:\s*\[\s*main\s*\]/.test(body));
}

describe("workflows that run on a push to main", () => {
  it("there is at least one, or this whole file is asserting about nothing", () => {
    // A guard whose subject list can silently become empty passes hardest when
    // nothing matches (L98, L159).
    expect(workflowsTriggeredByPushToMain().length).toBeGreaterThan(0);
  });

  it.each(workflowsTriggeredByPushToMain().map((w) => w.file))(
    "%s does not cancel a run in progress on main",
    (file) => {
      const body = readFileSync(join(DIR, file), "utf8");
      const concurrency = body.match(/^concurrency:\n(?:\s+.*\n)+/m);
      if (!concurrency) return; // No concurrency group: nothing cancels anything.

      // The rule is only that a main run must not be cancelled. Three shapes
      // satisfy it: no cancel-in-progress at all, a flat `false` (which the
      // scheduled production checks use, since two of them racing is the thing
      // they avoid), and the conditional form the PR-gating jobs need so they
      // still cancel superseded runs on a branch.
      //
      // A bare `true` is the only defect. An earlier version of this demanded
      // the conditional form outright and failed the two workflows that were
      // already correct, which is a guard stricter than its own rule.
      const setting = concurrency[0].match(/cancel-in-progress:\s*(.+)/);
      if (!setting) return;
      const value = setting[1].trim();
      if (value === "false") return;
      expect(value, `${file} cancels runs on main`).not.toBe("true");
      expect(value).toMatch(
        /^\$\{\{[^}]*github\.ref\s*!=\s*'refs\/heads\/main'[^}]*\}\}$/,
      );
    },
  );
});
