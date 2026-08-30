// @vitest-environment node
//
// Turning GitHub's answers into the facts proveMergedTree judges (#812).
//
// The network is injected. A test whose only outside dependency is a stub can
// only confirm the author's assumption about the real interface (L52), so the
// shapes below are the shapes the REST API documents, and the URLs are asserted
// so a wrong endpoint is caught here rather than by a proof that never holds.
import { describe, it, expect, vi } from "vitest";
import { gatherProofFacts } from "./merged-tree-proof-facts";

const REPO = "nursedexapp/nursedex";
const PUSHED = "cccccccccccccccccccccccccccccccccccccccc";
const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TREE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** A fetcher answering each documented endpoint, recording what it was asked. */
function fakeApi(overrides: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const routes: Record<string, unknown> = {
    [`/repos/${REPO}/commits/${PUSHED}/pulls`]: [
      {
        number: 794,
        merged_at: "2026-08-22T00:36:02Z",
        base: { ref: "main" },
        head: { sha: HEAD },
      },
    ],
    [`/repos/${REPO}/commits/${PUSHED}`]: { commit: { tree: { sha: TREE } } },
    [`/repos/${REPO}/commits/${HEAD}`]: { commit: { tree: { sha: TREE } } },
    [`/repos/${REPO}/commits/${HEAD}/check-runs?filter=latest&per_page=100`]: {
      check_runs: [
        { name: "authenticated e2e", status: "completed", conclusion: "success" },
        { name: "lint, typecheck, test", status: "completed", conclusion: "success" },
      ],
    },
    ...overrides,
  };
  const getJson = vi.fn(async (path: string) => {
    asked.push(path);
    if (!(path in routes)) throw new Error(`unexpected path: ${path}`);
    return routes[path];
  });
  return { getJson, asked };
}

describe("gatherProofFacts", () => {
  it("builds the facts the evaluator judges", async () => {
    const { getJson } = fakeApi();
    const facts = await gatherProofFacts({
      getJson,
      repo: REPO,
      sha: PUSHED,
      requiredCheck: "authenticated e2e",
    });

    expect(facts.pushedSha).toBe(PUSHED);
    expect(facts.pushedTree).toBe(TREE);
    expect(facts.requiredCheck).toBe("authenticated e2e");
    expect(facts.pulls).toHaveLength(1);
    expect(facts.pulls[0]).toMatchObject({
      number: 794,
      merged: true,
      baseRef: "main",
      headSha: HEAD,
      headTree: TREE,
    });
    expect(facts.pulls[0].checks).toContainEqual({
      name: "authenticated e2e",
      status: "completed",
      conclusion: "success",
    });
  });

  // GitHub returns every check run for a sha, including superseded ones from a
  // re-run. Without filter=latest an old green would answer for a new red
  // (L179), which is the one direction this must never get wrong.
  it("asks only for the latest run of each check", async () => {
    const { getJson, asked } = fakeApi();
    await gatherProofFacts({
      getJson,
      repo: REPO,
      sha: PUSHED,
      requiredCheck: "authenticated e2e",
    });
    expect(asked.some((p) => p.includes("check-runs?filter=latest"))).toBe(true);
  });

  it("reads an unmerged pull request as unmerged rather than dropping it", async () => {
    const { getJson } = fakeApi({
      [`/repos/${REPO}/commits/${PUSHED}/pulls`]: [
        { number: 794, merged_at: null, base: { ref: "main" }, head: { sha: HEAD } },
      ],
    });
    const facts = await gatherProofFacts({
      getJson,
      repo: REPO,
      sha: PUSHED,
      requiredCheck: "authenticated e2e",
    });
    expect(facts.pulls[0].merged).toBe(false);
  });

  it("carries a commit with no associated pull request through as an empty list", async () => {
    const { getJson } = fakeApi({ [`/repos/${REPO}/commits/${PUSHED}/pulls`]: [] });
    const facts = await gatherProofFacts({
      getJson,
      repo: REPO,
      sha: PUSHED,
      requiredCheck: "authenticated e2e",
    });
    expect(facts.pulls).toEqual([]);
    expect(facts.pushedTree).toBe(TREE);
  });

  // A failed lookup must not read as a fact. Returning an empty list here
  // would be indistinguishable from a real direct push (L215, L98).
  it("throws when a lookup fails rather than reporting an absence", async () => {
    const getJson = vi.fn(async () => {
      throw new Error("403 rate limit exceeded");
    });
    await expect(
      gatherProofFacts({
        getJson,
        repo: REPO,
        sha: PUSHED,
        requiredCheck: "authenticated e2e",
      }),
    ).rejects.toThrow(/rate limit/);
  });

  it("refuses a response that carries no tree hash instead of defaulting it", async () => {
    const { getJson } = fakeApi({ [`/repos/${REPO}/commits/${PUSHED}`]: { commit: {} } });
    await expect(
      gatherProofFacts({
        getJson,
        repo: REPO,
        sha: PUSHED,
        requiredCheck: "authenticated e2e",
      }),
    ).rejects.toThrow(/tree/i);
  });
});
