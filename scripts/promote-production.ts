// The production promotion gate (#817), carrying out the decision recorded in
// #801: a merge to main must not reach a family until the checks on that
// commit are green.
//
// Vercel builds a STAGED production deployment on every push to main, serving
// nobody, and something has to promote it. This decides whether to.
//
// Every case it cannot establish is a refusal. Refusing costs a deploy that
// waits for a person to look; promoting wrongly puts untested code in front of
// families. Those are not comparable, so there is no "probably fine" branch.

/** A deployment as the Vercel API reports it. */
export type Deployment = {
  uid: string;
  url: string;
  /** BUILDING, READY, ERROR, QUEUED, CANCELED, ... */
  readyState: string;
  /**
   * Vercel's own record of whether this has served production traffic:
   * STAGED (never has), ROLLING (partway), PROMOTED (has).
   *
   * This is what makes the promotion idempotent, and it comes from the
   * platform rather than being inferred here.
   */
  readySubstate?: string;
  target: string | null;
};

/** The latest run of one check on the commit. */
export type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
};

export type Decision =
  | { action: "promote"; deployment: Deployment; reason: string }
  | { action: "already-live"; deployment: Deployment; reason: string }
  | { action: "wait"; reason: string }
  | { action: "refuse"; reason: string };

export type DecisionInput = {
  sha: string;
  deployments: Deployment[];
  checks: CheckRun[];
  /** Exact names, as the `Protect main` ruleset requires them. */
  requiredChecks: string[];
};

export function decidePromotion(input: DecisionInput): Decision {
  const { sha, deployments, checks, requiredChecks } = input;

  // The checks first: there is no point identifying a deployment we are not
  // allowed to promote, and a failed check is the interesting answer.
  for (const name of requiredChecks) {
    // Matched by exact name. The ruleset requires these by name, and a rename
    // makes them silently absent rather than failing (L305).
    const check = checks.find((c) => c.name === name);

    if (!check) {
      return {
        action: "refuse",
        reason:
          `There is no \`${name}\` check on ${sha}, and a check that is ` +
          `absent is not a check that passed. Either it never ran or it has ` +
          `been renamed, and the ruleset requires it by that exact name.`,
      };
    }

    if (check.conclusion === null) {
      return {
        action: "wait",
        reason:
          `\`${name}\` on ${sha} has not finished (status ${check.status}). ` +
          `Nothing to do yet; this runs again when it does.`,
      };
    }

    if (check.conclusion !== "success") {
      return {
        action: "refuse",
        reason:
          `\`${name}\` on ${sha} concluded ${check.conclusion}, not success. ` +
          `This commit is not going to production.`,
      };
    }
  }

  // Only production deployments. A preview build of the same commit exists for
  // every pull request and is not what is being promoted.
  const candidates = deployments.filter((d) => d.target === "production");

  if (candidates.length === 0) {
    return {
      action: "refuse",
      reason:
        `No production deployment exists for ${sha}. The checks passed but ` +
        `there is nothing to promote, so either the build never started or ` +
        `it was removed.`,
    };
  }

  // L521: a lookup needing exactly one match treats many as its own refusal.
  // Taking the first would promote a deployment nobody chose.
  if (candidates.length > 1) {
    const uids = candidates.map((d) => d.uid).join(", ");
    return {
      action: "refuse",
      reason:
        `More than one production deployment claims ${sha} (${uids}), so ` +
        `there is no single one to promote.`,
    };
  }

  const deployment = candidates[0];

  if (deployment.readyState === "BUILDING" || deployment.readyState === "QUEUED" ||
      deployment.readyState === "INITIALIZING") {
    return {
      action: "wait",
      reason:
        `The production build for ${sha} is ${deployment.readyState}. ` +
        `Nothing to do yet; this runs again when the checks next report.`,
    };
  }

  if (deployment.readyState !== "READY") {
    return {
      action: "refuse",
      reason:
        `The production build for ${sha} is ${deployment.readyState}, not ` +
        `READY, so there is nothing servable to promote.`,
    };
  }

  // Assume it runs twice. This fires once per finishing check, so the second
  // arrival finds the work already done and must succeed rather than fail.
  if (deployment.readySubstate === "PROMOTED") {
    return {
      action: "already-live",
      deployment,
      reason:
        `The production build for ${sha} (${deployment.uid}) is already ` +
        `live. Nothing to do.`,
    };
  }

  return {
    action: "promote",
    deployment,
    reason:
      `Every required check is green on ${sha} and its production build ` +
      `(${deployment.uid}) is ready and has never served traffic. Promoting.`,
  };
}

/* ------------------------------------------------------------- carrying it out */

export type PromotionOutcome =
  | "promoted"
  | "already-live"
  | "wait"
  | "refuse"
  | "failed";

export type PromotionDeps = {
  sha: string;
  requiredChecks: string[];
  getChecks: () => Promise<CheckRun[]>;
  getDeployments: () => Promise<Deployment[]>;
  promote: (uid: string) => Promise<void>;
  say: (line: string) => void;
};

/**
 * Do the promotion, reporting every outcome.
 *
 * Never throws: the caller decides the exit code, and a thrown error here would
 * skip the reporting that tells a person production did not update. A promotion
 * that silently did not happen leaves production serving the previous build,
 * which looks exactly like a quiet week (L98, L13).
 */
export async function runPromotion(deps: PromotionDeps): Promise<PromotionOutcome> {
  const { sha, requiredChecks, getChecks, getDeployments, promote, say } = deps;

  let checks: CheckRun[];
  let deployments: Deployment[];
  try {
    [checks, deployments] = await Promise.all([getChecks(), getDeployments()]);
  } catch (error) {
    say(
      `### Production promotion: FAILED\n\n` +
        `${error instanceof Error ? error.message : String(error)}\n\n` +
        `Production is still serving the previous build.`,
    );
    return "failed";
  }

  const decision = decidePromotion({ sha, deployments, checks, requiredChecks });

  if (decision.action === "wait") {
    say(`### Production promotion: waiting\n\n${decision.reason}`);
    return "wait";
  }

  if (decision.action === "refuse") {
    say(`### Production promotion: REFUSED\n\n${decision.reason}`);
    return "refuse";
  }

  if (decision.action === "already-live") {
    say(`### Production promotion: already live\n\n${decision.reason}`);
    return "already-live";
  }

  try {
    await promote(decision.deployment.uid);
  } catch (error) {
    say(
      `### Production promotion: FAILED\n\n` +
        `${error instanceof Error ? error.message : String(error)}\n\n` +
        `Production is still serving the previous build.`,
    );
    return "failed";
  }

  say(
    `### Production promotion: done\n\n${decision.reason}\n\n` +
      `Promoted \`${decision.deployment.uid}\` (${decision.deployment.url}).`,
  );
  return "promoted";
}

/** Which outcomes mean the job should go red. */
export function isFailure(outcome: PromotionOutcome): boolean {
  // "wait" is not a failure: the run fires once per finishing workflow, and the
  // early one legitimately has nothing to do yet. Failing on it would make this
  // red on every merge and train everyone to ignore it (L36).
  return outcome === "refuse" || outcome === "failed";
}

/**
 * Which of the settings this needs are missing.
 *
 * Named individually rather than as a single "not configured", because
 * "something was missing" sends whoever reads it back to work out which (L11).
 * Returned rather than thrown so the caller can report before exiting: an
 * unconfigured run that says nothing is indistinguishable from one that had
 * nothing to do.
 */
export function missingSettings(env: Record<string, string | undefined>): string[] {
  return ["GITHUB_REPOSITORY", "COMMIT_SHA", "GITHUB_TOKEN", "VERCEL_TOKEN"].filter(
    (name) => !env[name],
  );
}
