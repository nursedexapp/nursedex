// Two jobs for the E2E job's Supabase start (#802), split by when they run.
//
//   before   `check`  the services named must not be ones the suite uses
//   after    `count`  the services excluded must actually not be running
//
// The second is the real guard. `--exclude` is a cobra string slice and
// silently ignores a name it does not know, so a typo, or a service renamed in
// a later CLI (this job tracks `latest`), excludes nothing while the step reads
// as successful.
//
// An earlier version asked the CLI which names it accepted, by parsing
// `supabase start --help`. That broke on its first run: the runner's 2.116
// prints that list differently from the 2.75 it was written against. Measuring
// the outcome needs no agreement about how a help page is worded (L63, L103).
import { checkExclusions, countRunningServices } from "./supabase-exclusions";

/**
 * The stack should be five containers with the seven exclusions in force, and
 * twelve without them. The bounds sit either side of five with room for
 * Supabase to add or merge a service without a false alarm, and far below
 * twelve, which is the reading that means the exclusions stopped working.
 */
const BOUNDS = { atLeast: 3, atMost: 8 };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function wantedServices(): string[] {
  const raw = process.env.EXCLUDED_SERVICES;
  if (!raw) {
    throw new Error(
      "EXCLUDED_SERVICES is not set. Refusing rather than starting every " +
        "service, which would be slow and silent.",
    );
  }
  return raw.split(/[\s,]+/).filter((name) => name.length > 0);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  try {
    if (mode === "check") {
      // Prints the comma-joined list for `supabase start -x`.
      process.stdout.write(checkExclusions(wantedServices()).join(","));
      return;
    }

    if (mode === "count") {
      const result = countRunningServices(await readStdin(), BOUNDS);
      process.stdout.write(`${result.message}\n`);
      return;
    }

    throw new Error(
      `Unknown mode "${mode ?? ""}". Expected "check" before the stack starts ` +
        `or "count" after it.`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

void main();
