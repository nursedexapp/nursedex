// @vitest-environment node
//
// #801 asked what a push to main MEANS, and the answer was a decision, not a
// speed fix: it is a gate, and production must not reach a family until the
// checks on that commit are green.
//
// A decision recorded only on an issue is true as of its date and nowhere
// else. The place it has to live is beside the trigger it governs, or the next
// person optimises these runs on the assumption that nothing waits for them
// (L61, L244, L308).
//
// These tests keep the record attached to the thing it describes: they check
// the note is beside the trigger it is about, and that it still names the
// mechanism it depends on. They cannot check that a sentence is TRUE, which is
// the honest limit of a doc test (L210).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

/**
 * The #801 decision block itself, not "the region after the trigger".
 *
 * An earlier version took a fixed window of characters following the trigger,
 * which swept in the neighbouring concurrency comment. That comment happens to
 * name #817 too, so the test that the decision names its dependency passed
 * because of an unrelated paragraph, and went on passing when the decision
 * stopped naming it (L178, L135).
 */
function decisionBlock(body: string): string | null {
  const start = body.indexOf("# What a push to main MEANS here");
  if (start === -1) return null;
  // The block runs to the first line that is not a comment.
  const lines = body.slice(start).split("\n");
  const end = lines.findIndex((line) => !line.startsWith("#"));
  return lines.slice(0, end === -1 ? undefined : end).join("\n");
}

/** Workflows whose job the production promotion will wait for (#817). */
function gatingWorkflows(): string[] {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".yml"))
    .filter((file) => {
      const body = readFileSync(join(DIR, file), "utf8");
      // The two that run the merged tree proof are exactly the two that gate.
      return body.includes("scripts/check-merged-tree-proof.ts");
    });
}

describe("the workflows a merge to main waits for", () => {
  it("there are some, or this file asserts about nothing", () => {
    expect(gatingWorkflows().length).toBeGreaterThan(0);
  });

  it.each(gatingWorkflows())(
    "%s records the #801 decision beside its push trigger",
    (file) => {
      const body = readFileSync(join(DIR, file), "utf8");
      const triggerAt = body.indexOf("  push:\n    branches: [main]");
      expect(triggerAt).toBeGreaterThan(-1);

      const block = decisionBlock(body);
      expect(block, "no #801 decision block in this workflow").not.toBeNull();

      // It has to sit with the trigger it is about, not elsewhere in the file
      // where nobody editing the trigger would read it.
      expect(body.indexOf(block!)).toBeGreaterThan(triggerAt);
      expect(body.indexOf(block!) - triggerAt).toBeLessThan(120);

      expect(block!).toContain("#801");
      expect(block!).toMatch(/GATE/);
    },
  );

  // The decision is only affordable because of the proof, and only real once
  // the promotion gate exists. A note that named neither would leave a reader
  // unable to check whether it is still true.
  it.each(gatingWorkflows())("%s names what the decision depends on", (file) => {
    const block = decisionBlock(readFileSync(join(DIR, file), "utf8"));
    expect(block, "does not name the promotion gate").toContain("#817");
    expect(block, "does not name the proof that makes it affordable").toContain("#812");
  });
});
