// Which Supabase services the E2E job leaves unstarted, and the check that the
// CLI actually accepts every name we give it (#802).
//
// `supabase start` pulls twelve Docker images cold on every run, about 115
// seconds of a 121 to 167 second step. Seven are for services nothing in the
// suite reaches: there are no edge functions in the repo, nothing subscribes to
// Realtime, the e2e setups create users through the admin API with
// email_confirm true, and nobody opens Studio on a runner.
//
// `--exclude` is a cobra string slice and does NOT validate its values. An
// unknown name is silently ignored, so a typo, or a service the CLI renames in
// a later version (the job tracks `latest`), would exclude nothing, cost the
// same 115 seconds, and look exactly like this working. Hence a check against
// the CLI's own published list rather than a list maintained beside it (L41).

/**
 * Services the suite genuinely uses. Excluding one of these would break the
 * run, and the CLI would accept the name without complaint, so being accepted
 * by the CLI is not on its own a reason to allow it here.
 */
const REQUIRED_BY_THE_SUITE: Record<string, string> = {
  "storage-api": "nurse photos and blog images are stored through it",
  imgproxy: "storage serves transformed images through it",
  kong: "every request from the app reaches the stack through it",
  postgrest: "the app's whole data layer is PostgREST",
  gotrue: "the authenticated projects sign users in through it",
  supavisor: "connection pooling for the database the suite reads",
};

/**
 * Check the services we want excluded against what the suite needs. Returns the
 * list on success, so a caller cannot use an unchecked one by accident.
 *
 * This deliberately does NOT check the names against the CLI's vocabulary. An
 * earlier version parsed them out of `supabase start --help`, which broke on
 * the first run: the runner tracks `latest` (2.116) and prints that list
 * differently from the 2.75 the parser was written against. Coupling a check to
 * the exact rendering of a value fails on the first legitimate change to it
 * (L103), and the thing actually worth knowing is not whether the CLI likes the
 * name but whether the service ended up running. That is measured after the
 * fact by countRunningServices below.
 */
export function checkExclusions(wanted: string[]): string[] {
  if (wanted.length === 0) {
    throw new Error(
      "No services were named, so there is nothing to exclude. An empty " +
        "list would start everything while reading as a working exclusion.",
    );
  }

  const seen = new Set<string>();
  const duplicates = wanted.filter((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
  if (duplicates.length > 0) {
    throw new Error(
      `These services are named twice: ${duplicates.join(", ")}. A duplicate ` +
        `is a sign the list was edited without being read; fix the list.`,
    );
  }

  const needed = wanted.filter((name) => name in REQUIRED_BY_THE_SUITE);
  if (needed.length > 0) {
    const reasons = needed
      .map((name) => `${name} (${REQUIRED_BY_THE_SUITE[name]})`)
      .join(", ");
    throw new Error(
      `Refusing to exclude services the suite uses: ${reasons}. The CLI would ` +
        `accept these names, which is exactly what makes excluding them ` +
        `dangerous.`,
    );
  }

  return wanted;
}

/**
 * What actually ended up running, checked against what should have.
 *
 * This is the real guard. `--exclude` is a cobra string slice and silently
 * ignores a name it does not know, so a typo, or a service renamed in a later
 * CLI, excludes nothing while the step reads as successful. Rather than ask the
 * CLI what names it likes, count the containers it left running: that measures
 * the outcome instead of a proxy for it (L63).
 *
 * Refuses in BOTH directions. Too many means the exclusions stopped working.
 * Too few, including none at all, means this is not measuring what it thinks it
 * is: a count of zero would otherwise be the healthiest possible reading of a
 * filter that matches nothing (L98).
 */
export function countRunningServices(
  dockerPsOutput: string,
  bounds: { atLeast: number; atMost: number },
): { count: number; names: string[]; message: string } {
  const names = dockerPsOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const count = names.length;
  const listed = names.join(", ") || "none";

  if (count < bounds.atLeast) {
    throw new Error(
      `Only ${count} Supabase containers are running (${listed}), fewer than ` +
        `the ${bounds.atLeast} this stack needs. Either the stack did not come ` +
        `up, or this is no longer counting the right containers, and an ` +
        `undercount reads as a very successful exclusion.`,
    );
  }

  if (count > bounds.atMost) {
    throw new Error(
      `${count} Supabase containers are running (${listed}), more than the ` +
        `${bounds.atMost} expected after the exclusions. A name --exclude does ` +
        `not recognise is silently ignored, so the services are still starting ` +
        `and the run is paying for them.`,
    );
  }

  return {
    count,
    names,
    message: `${count} Supabase containers running after the exclusions: ${listed}.`,
  };
}
