import { execFileSync } from "node:child_process";

/**
 * Which branches in this repository carry the file for a migration version
 * (#908).
 *
 * The drift check runs against `main`, so a migration applied to production
 * from a branch that has not merged yet reads as untracked. That is the safe
 * order for a migration live code depends on, and it clears itself on merge.
 * This is what tells that case apart from somebody applying SQL that exists
 * nowhere in git.
 *
 * Returns null, never an empty array, when it cannot answer. "No branch has
 * it" is a finding and "the lookup did not run" is not, and the two must not
 * collapse: a shallow checkout would otherwise accuse every deliberate
 * apply-ahead-of-merge of being a hand applied migration.
 */
export interface BranchLookupOptions {
  /** Injected so the lookup can be tested without a git repository. */
  run?: (args: string[]) => string;
  /** The ref prefix branches are listed under. */
  remote?: string;
}

function defaultRun(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * A migration version is three digits, and it is interpolated into a git
 * pathspec, so anything else is refused rather than passed through.
 */
const VERSION = /^[0-9]{3,}$/;

export function makeBranchLookup(options: BranchLookupOptions = {}) {
  const run = options.run ?? defaultRun;
  const remote = options.remote ?? "refs/remotes/origin";

  return function lookupBranches(version: string): string[] | null {
    if (!VERSION.test(version)) return null;

    let output: string;
    try {
      // Every remote branch except main, and whether its tree holds a file
      // named for this migration. --format keeps this to one git invocation
      // rather than one per branch.
      output = run([
        "for-each-ref",
        "--format=%(refname:short)",
        remote,
      ]);
    } catch {
      return null;
    }

    const branches = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((name) => name !== "origin/main" && name !== "origin/HEAD");

    // No branches at all means the refs were never fetched (a shallow default
    // checkout), not that no branch carries it.
    if (branches.length === 0) return null;

    const carrying: string[] = [];
    for (const branch of branches) {
      let tree: string;
      try {
        tree = run(["ls-tree", "--name-only", branch, "supabase/migrations/"]);
      } catch {
        // One unreadable branch must not answer for the whole question.
        return null;
      }
      const has = tree
        .split("\n")
        .some((path) => path.trim().startsWith(`supabase/migrations/${version}_`));
      if (has) carrying.push(branch);
    }

    return carrying;
  };
}
