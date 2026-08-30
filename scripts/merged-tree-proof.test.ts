// @vitest-environment node
//
// The proof behind the post-merge skip (#812) and, since #801, behind the
// production promotion gate (#817).
//
// A push to main re-runs a suite that has already passed, on a tree that is
// byte for byte the pull request's tree: the `Protect main` ruleset requires
// linear history and an up-to-date branch, and merges are squashes. Checked on
// six merges (#789 to #794), every merge commit's tree hash was identical to
// the pull request head that carried the green check.
//
// This decides whether that is true of one particular push. Everything it
// cannot establish is a refusal, because the cost of refusing is running tests
// that were not needed and the cost of accepting wrongly is shipping untested
// code to a family.
import { describe, it, expect } from "vitest";
import { proveMergedTree, type ProofFacts, type PullFact } from "./merged-tree-proof";

const TREE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PUSHED = "cccccccccccccccccccccccccccccccccccccccc";

function pull(overrides: Partial<PullFact> = {}): PullFact {
  return {
    number: 794,
    merged: true,
    baseRef: "main",
    headSha: HEAD,
    headTree: TREE,
    checks: [
      { name: "authenticated e2e", status: "completed", conclusion: "success" },
    ],
    ...overrides,
  };
}

function facts(overrides: Partial<ProofFacts> = {}): ProofFacts {
  return {
    pushedSha: PUSHED,
    pushedTree: TREE,
    pulls: [pull()],
    requiredCheck: "authenticated e2e",
    ...overrides,
  };
}

describe("proveMergedTree", () => {
  it("proves a squash merge whose tree matches a pull request with a green check", () => {
    const result = proveMergedTree(facts());
    expect(result.proven).toBe(true);
    if (!result.proven) return;
    expect(result.pull).toBe(794);
    expect(result.headSha).toBe(HEAD);
    expect(result.tree).toBe(TREE);
  });

  // Each refusal below names its own cause. Two refusals that read the same
  // are one refusal in practice, and the one nobody can tell apart is the one
  // that hides a broken lookup behind a plausible "direct push" (L11, L260).
  it("refuses a commit no pull request is associated with", () => {
    const result = proveMergedTree(facts({ pulls: [] }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/no pull request/i);
  });

  it("refuses when the associated pull request was never merged", () => {
    const result = proveMergedTree(facts({ pulls: [pull({ merged: false })] }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/not merged/i);
  });

  it("refuses a pull request that targeted a branch other than main", () => {
    const result = proveMergedTree(facts({ pulls: [pull({ baseRef: "develop" })] }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/develop/);
  });

  // L521: a lookup needing exactly one match must treat MANY as its own
  // refusal. Silently taking the first would pick a pull request at random and
  // then prove the wrong thing about it.
  it("refuses when more than one merged pull request claims the commit", () => {
    const result = proveMergedTree(
      facts({ pulls: [pull({ number: 794 }), pull({ number: 795 })] }),
    );
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/more than one/i);
    expect(result.reason).toContain("794");
    expect(result.reason).toContain("795");
  });

  it("refuses when the merged tree differs from the tested tree, and shows both", () => {
    const other = "dddddddddddddddddddddddddddddddddddddddd";
    const result = proveMergedTree(facts({ pushedTree: other }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toContain(other);
    expect(result.reason).toContain(TREE);
  });

  it("refuses when the required check never ran on the tested head", () => {
    const result = proveMergedTree(facts({ pulls: [pull({ checks: [] })] }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/authenticated e2e/);
    expect(result.reason).toMatch(/no .*check/i);
  });

  it("refuses when the required check failed, and names the conclusion", () => {
    const result = proveMergedTree(
      facts({
        pulls: [
          pull({
            checks: [
              { name: "authenticated e2e", status: "completed", conclusion: "failure" },
            ],
          }),
        ],
      }),
    );
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toContain("failure");
  });

  // A check still running has no conclusion at all. Treating a null conclusion
  // as anything but a refusal would accept a suite that has not finished.
  it("refuses a required check that has not finished", () => {
    const result = proveMergedTree(
      facts({
        pulls: [
          pull({
            checks: [
              { name: "authenticated e2e", status: "in_progress", conclusion: null },
            ],
          }),
        ],
      }),
    );
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/not finished|in_progress/i);
  });

  it("refuses a check that was skipped rather than run", () => {
    const result = proveMergedTree(
      facts({
        pulls: [
          pull({
            checks: [
              { name: "authenticated e2e", status: "completed", conclusion: "skipped" },
            ],
          }),
        ],
      }),
    );
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toContain("skipped");
  });

  // The check is matched by exact name. A ruleset requires checks by name, so
  // a near miss here would silently rest the proof on a different check.
  it("does not accept a differently named check as the required one", () => {
    const result = proveMergedTree(
      facts({
        pulls: [
          pull({
            checks: [
              { name: "authenticated e2e (retry)", status: "completed", conclusion: "success" },
            ],
          }),
        ],
      }),
    );
    expect(result.proven).toBe(false);
  });

  it("refuses an empty or missing tree hash rather than matching it against another", () => {
    const result = proveMergedTree(facts({ pushedTree: "" }));
    expect(result.proven).toBe(false);
    if (result.proven) return;
    expect(result.reason).toMatch(/tree/i);
  });
});
