// Turns GitHub's answers into the facts proveMergedTree judges (#812).
//
// The network is a parameter, not a construction: a component that builds its
// own dependency is beyond every refusal that dependency could offer (L196),
// and this one has to be driven through failures a live API will not produce on
// demand.
import type { CheckFact, ProofFacts, PullFact } from "./merged-tree-proof";

/** Fetches a REST path and returns its parsed JSON, or throws. */
export type GetJson = (path: string) => Promise<unknown>;

export type GatherOptions = {
  getJson: GetJson;
  /** owner/name. */
  repo: string;
  /** The commit pushed to main. */
  sha: string;
  requiredCheck: string;
};

function treeOf(commit: unknown, describedAs: string): string {
  const tree = (commit as { commit?: { tree?: { sha?: unknown } } })?.commit?.tree
    ?.sha;
  if (typeof tree !== "string" || tree.length === 0) {
    // Returning "" here would be compared against another "" and match, so a
    // malformed response would read as a proof rather than as a failure.
    throw new Error(
      `GitHub returned no tree hash for ${describedAs}. The proof cannot be ` +
        `evaluated from this response.`,
    );
  }
  return tree;
}

/**
 * Gather everything the proof needs. Throws on any failed or unusable lookup:
 * an absence and a failure must not arrive as the same value, because an empty
 * pull request list is a legitimate fact (a direct push) and a 403 is not.
 */
export async function gatherProofFacts(
  options: GatherOptions,
): Promise<ProofFacts> {
  const { getJson, repo, sha, requiredCheck } = options;

  const associated = (await getJson(`/repos/${repo}/commits/${sha}/pulls`)) as Array<{
    number: number;
    merged_at: string | null;
    base: { ref: string };
    head: { sha: string };
  }>;

  const pushedTree = treeOf(
    await getJson(`/repos/${repo}/commits/${sha}`),
    `pushed commit ${sha}`,
  );

  const pulls: PullFact[] = [];
  for (const pr of associated) {
    const headSha = pr.head.sha;
    const headTree = treeOf(
      await getJson(`/repos/${repo}/commits/${headSha}`),
      `pull request #${pr.number} head ${headSha}`,
    );

    // filter=latest asks for the latest run of each check name. Without it a
    // superseded green from before a re-run answers for the run that replaced
    // it, which is the one direction this must never get wrong (L179).
    const runs = (await getJson(
      `/repos/${repo}/commits/${headSha}/check-runs?filter=latest&per_page=100`,
    )) as { check_runs: Array<{ name: string; status: string; conclusion: string | null }> };

    const checks: CheckFact[] = runs.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
    }));

    pulls.push({
      number: pr.number,
      merged: pr.merged_at !== null,
      baseRef: pr.base.ref,
      headSha,
      headTree,
      checks,
    });
  }

  return { pushedSha: sha, pushedTree, pulls, requiredCheck };
}
