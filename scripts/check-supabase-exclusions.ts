// Reads `supabase start --help` on stdin, checks the services named in
// EXCLUDED_SERVICES against what the CLI actually accepts, and prints the
// comma-joined list for `supabase start -x` (#802).
//
// Exits non-zero on any problem, so the E2E job fails loudly rather than
// starting everything and paying the 115 seconds this exists to avoid.
import { parseAcceptedExclusions, checkExclusions } from "./supabase-exclusions";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = process.env.EXCLUDED_SERVICES;
  if (!raw) {
    process.stderr.write(
      "EXCLUDED_SERVICES is not set. Refusing rather than starting every " +
        "service, which would be slow and silent.\n",
    );
    process.exit(1);
  }

  const help = await readStdin();
  if (help.trim().length === 0) {
    // An empty help text and a CLI that answered are different situations, and
    // only one of them means the names are unchecked (L11).
    process.stderr.write(
      "`supabase start --help` produced nothing on stdin, so the exclusion " +
        "names could not be checked against anything.\n",
    );
    process.exit(1);
  }

  try {
    const wanted = raw.split(/[\s,]+/).filter((name) => name.length > 0);
    const checked = checkExclusions(wanted, parseAcceptedExclusions(help));
    process.stdout.write(checked.join(","));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

void main();
