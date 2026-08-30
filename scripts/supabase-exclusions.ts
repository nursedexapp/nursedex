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

/** The names `supabase start --exclude` says it accepts, read from its help. */
export function parseAcceptedExclusions(help: string): string[] {
  const match = help.match(/--exclude\s+strings[^\n[]*\[([^\]]*)\]/);
  if (!match) {
    throw new Error(
      "Could not find the --exclude list in `supabase start --help`. The CLI " +
        "has changed its help format, so the exclusion names cannot be " +
        "checked against anything. Fix this before trusting the exclusions.",
    );
  }
  const names = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) {
    // An empty accepted list would make every name look invalid, which reads
    // as a broken exclusion list rather than as a broken parse (L11).
    throw new Error(
      "`supabase start --help` listed no names for --exclude. That is a " +
        "parsing failure, not an empty CLI: refusing rather than guessing.",
    );
  }
  return names;
}

/**
 * Check the services we want excluded against what the CLI accepts and against
 * what the suite needs. Returns the list on success so the caller cannot use an
 * unchecked one by accident.
 */
export function checkExclusions(wanted: string[], accepted: string[]): string[] {
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

  const unknown = wanted.filter((name) => !accepted.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `\`supabase start --exclude\` does not accept: ${unknown.join(", ")}. ` +
        `It accepts: ${accepted.join(", ")}. An unaccepted name is silently ` +
        `ignored, so this would have excluded nothing and looked like it worked.`,
    );
  }

  return wanted;
}
