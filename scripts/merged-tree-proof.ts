// Proof that a commit pushed to main carries a tree that has already been
// tested (#812), which since #801 is also what the production promotion gate
// rests on (#817).
//
// The `Protect main` ruleset requires linear history and an up-to-date branch,
// and merges are squashes, so the merged commit's tree is the pull request
// head's tree. Measured across six merges (#789 to #794): identical every time.
// Re-running the suite on that tree proves nothing new, and on main it is the
// thing production waits for.
//
// Every branch here that cannot establish the identity is a refusal. Refusing
// wrongly costs one redundant test run; accepting wrongly ships code to a
// family that nothing has run. Those are not comparable, so there is no
// "probably fine" case and no fallback to a nearby candidate (L75).

/** One check run, already reduced to the latest run for its name. */
export type CheckFact = {
  name: string;
  status: string;
  conclusion: string | null;
};

/** A pull request GitHub associates with the pushed commit. */
export type PullFact = {
  number: number;
  merged: boolean;
  baseRef: string;
  headSha: string;
  /** Tree hash of the pull request's head commit. */
  headTree: string;
  checks: CheckFact[];
};

export type ProofFacts = {
  /** The commit pushed to main. */
  pushedSha: string;
  /** Its tree hash. */
  pushedTree: string;
  pulls: PullFact[];
  /** Exact name of the check whose green result the proof rests on. */
  requiredCheck: string;
};

export type ProofResult =
  | { proven: true; pull: number; headSha: string; tree: string }
  | { proven: false; reason: string };

function refuse(reason: string): ProofResult {
  return { proven: false, reason };
}

/**
 * Decide whether the pushed commit's tree was already proven green.
 *
 * Returns a refusal with its own distinct wording for every way the proof can
 * fail, so a caller reading the reason can tell a direct push from a broken
 * lookup from a genuinely different tree. Two refusals that read alike are one
 * refusal, and the indistinguishable one always turns out to be hiding the
 * broken lookup (L11).
 */
export function proveMergedTree(facts: ProofFacts): ProofResult {
  // A tree hash is the whole comparison. An empty one would otherwise be
  // compared against another empty one and match (L50, L214).
  if (!facts.pushedTree) {
    return refuse(
      `The pushed commit ${facts.pushedSha} has no tree hash, so there is ` +
        `nothing to compare. Running the full suite.`,
    );
  }

  if (facts.pulls.length === 0) {
    return refuse(
      `No pull request is associated with ${facts.pushedSha}. This is a ` +
        `direct push, or the association has not appeared yet. Running the ` +
        `full suite.`,
    );
  }

  // Narrow to the population the proof is about before counting, so "two pull
  // requests, one of them a draft against another branch" is not an ambiguity.
  const wrongBase = facts.pulls.filter((p) => p.baseRef !== "main");
  const candidates = facts.pulls.filter((p) => p.baseRef === "main");

  if (candidates.length === 0) {
    const bases = wrongBase.map((p) => `#${p.number} into ${p.baseRef}`).join(", ");
    return refuse(
      `No pull request associated with ${facts.pushedSha} targeted main ` +
        `(${bases}). Running the full suite.`,
    );
  }

  // L521: a lookup that needs exactly one match must treat many as its own
  // refusal. Taking the first would pick one at random and then prove
  // something true about a pull request nobody asked about.
  const merged = candidates.filter((p) => p.merged);
  if (merged.length > 1) {
    const numbers = merged.map((p) => `#${p.number}`).join(", ");
    return refuse(
      `More than one merged pull request claims ${facts.pushedSha} ` +
        `(${numbers}), so there is no single tested tree to compare against. ` +
        `Running the full suite.`,
    );
  }

  if (merged.length === 0) {
    const numbers = candidates.map((p) => `#${p.number}`).join(", ");
    return refuse(
      `The pull request associated with ${facts.pushedSha} (${numbers}) is ` +
        `not merged, so this commit did not come from it. Running the full ` +
        `suite.`,
    );
  }

  const pr = merged[0];

  if (!pr.headTree) {
    return refuse(
      `Pull request #${pr.number} head ${pr.headSha} has no tree hash, so ` +
        `there is nothing to compare. Running the full suite.`,
    );
  }

  if (pr.headTree !== facts.pushedTree) {
    return refuse(
      `The merged tree is not the tested tree: pushed ${facts.pushedTree}, ` +
        `#${pr.number} head ${pr.headSha} was ${pr.headTree}. Something ` +
        `changed between the tested commit and this one. Running the full suite.`,
    );
  }

  // Exact name, never a prefix. A ruleset requires checks by name, so a loose
  // match would rest the proof on a differently named check that gates nothing.
  const check = pr.checks.find((c) => c.name === facts.requiredCheck);

  if (!check) {
    const seen = pr.checks.map((c) => c.name).join(", ") || "none";
    return refuse(
      `There is no ${facts.requiredCheck} check on #${pr.number} head ` +
        `${pr.headSha} (checks present: ${seen}). Running the full suite.`,
    );
  }

  if (check.conclusion === null) {
    return refuse(
      `The ${facts.requiredCheck} check on #${pr.number} head ${pr.headSha} ` +
        `has not finished (status ${check.status}). Running the full suite.`,
    );
  }

  if (check.conclusion !== "success") {
    return refuse(
      `The ${facts.requiredCheck} check on #${pr.number} head ${pr.headSha} ` +
        `concluded ${check.conclusion}, not success. Running the full suite.`,
    );
  }

  return {
    proven: true,
    pull: pr.number,
    headSha: pr.headSha,
    tree: pr.headTree,
  };
}
