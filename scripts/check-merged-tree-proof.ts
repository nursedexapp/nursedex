// The step ci.yml and e2e.yml run on a push to main (#812, #817).
//
// It answers one question: has this exact tree already been through the suite?
// It must never fail the job. Its answer decides whether the suite runs, and
// the safe answer is always "run it", so every failure arrives as a refusal.
//
// Refusals come in two kinds and are deliberately worded apart. A REASONED
// refusal (direct push, tree mismatch, red check) is a normal event. A FAILED
// LOOKUP is not: it means the proof stopped being evaluable, the full suite
// runs on every merge from then on, and nothing anywhere goes red (L289, L11).
import { proveMergedTree, type ProofFacts } from "./merged-tree-proof";
import { gatherProofFacts, type GetJson } from "./merged-tree-proof-facts";
import { appendFileSync } from "node:fs";
import { ANNOTATION_TITLES } from "./ci-annotations";

export type RunOptions = {
  gather: () => Promise<ProofFacts>;
  repo: string;
  sha: string;
  requiredCheck: string;
  writeOutput: (line: string) => void;
  writeSummary: (line: string) => void;
  log: (line: string) => void;
};

/**
 * Evaluate the proof and report it. Resolves to whether the proof held, and
 * never rejects: a rejection here would fail the job, and this step exists to
 * decide what the job does, not whether it passes.
 */
export async function runProofCheck(options: RunOptions): Promise<boolean> {
  const { gather, sha, requiredCheck, writeOutput, writeSummary, log } = options;

  let facts: ProofFacts;
  try {
    facts = await gather();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeOutput("proven=false");
    writeSummary("### Merged tree proof: lookup failed");
    writeSummary("");
    writeSummary(
      `The proof could not be evaluated for \`${sha}\`, so the full suite is ` +
        `running. This is not a normal refusal: while it persists, every ` +
        `merge pays the full run and nothing else reports it.`,
    );
    writeSummary("");
    writeSummary(`> ${message}`);
    // A workflow warning annotation, so a failed lookup is visible in the run
    // list rather than only to somebody who opens the summary. One blip and a
    // permanently broken token otherwise look identical, and the second means
    // every merge is paying the full run for nothing (L77). Counting the RATE
    // across runs is #818; this is the per-run half of it.
    // Both: the notice so #818 can count this run at all, the warning so a
    // person sees it. Without the notice, a run with no annotation means both
    // "the proof was not evaluated here" and "this predates the annotations",
    // and the counter reads every older run as healthy (L223).
    log(`::notice title=${ANNOTATION_TITLES.mergedTreeProof}::OUTCOME=unavailable`);
    log(`::warning title=Merged tree proof unavailable::${message}`);
    log(`Merged tree proof could not be evaluated: ${message}`);
    return false;
  }

  const result = proveMergedTree(facts);

  if (result.proven) {
    writeOutput("proven=true");
    writeSummary("### Merged tree proof: held");
    writeSummary("");
    writeSummary(
      `\`${sha}\` carries the same tree as the head of #${result.pull} ` +
        `(\`${result.headSha}\`), whose \`${requiredCheck}\` check was green.`,
    );
    writeSummary("");
    writeSummary(`Tree: \`${result.tree}\``);
    writeSummary("");
    writeSummary(
      "The suite is not re-run on this tree. Nothing was skipped that has " +
        "not already passed on exactly these bytes.",
    );
    log(`::notice title=${ANNOTATION_TITLES.mergedTreeProof}::OUTCOME=held PULL=${result.pull}`);
    log(`Merged tree proof held against #${result.pull} (${result.headSha}).`);
    return true;
  }

  writeOutput("proven=false");
  writeSummary("### Merged tree proof: did not hold");
  writeSummary("");
  writeSummary(result.reason);
  log(`::notice title=${ANNOTATION_TITLES.mergedTreeProof}::OUTCOME=refused`);
  log(`Merged tree proof did not hold: ${result.reason}`);
  return false;
}

/** Appends a line to a file named by an environment variable, if it is set. */
function appender(variable: string): (line: string) => void {
  const path = process.env[variable];
  if (!path) {
    // Outside Actions there is no such file. Say so rather than silently
    // discarding the answer the caller is waiting for.
    return (line) => process.stdout.write(`${variable} (unset): ${line}\n`);
  }
  return (line) => appendFileSync(path, `${line}\n`);
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const token = process.env.GITHUB_TOKEN;
  const requiredCheck = process.env.REQUIRED_CHECK;

  const missing = Object.entries({
    GITHUB_REPOSITORY: repo,
    GITHUB_SHA: sha,
    GITHUB_TOKEN: token,
    REQUIRED_CHECK: requiredCheck,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);

  const writeOutput = appender("GITHUB_OUTPUT");
  const writeSummary = appender("GITHUB_STEP_SUMMARY");

  if (missing.length > 0) {
    // Named individually, because "something was missing" sends whoever reads
    // it back to work out which (L11).
    writeOutput("proven=false");
    writeSummary("### Merged tree proof: lookup failed");
    writeSummary("");
    writeSummary(
      `Not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unset.`,
    );
    process.stdout.write(`Merged tree proof not configured: ${missing.join(", ")}\n`);
    return;
  }

  const getJson: GetJson = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      // The body is the diagnosis when there is one, but a HEAD-like empty
      // body must not read as "no information" (L520), so the status is always
      // part of the message.
      const body = await response.text().catch(() => "");
      throw new Error(
        `GitHub API ${response.status} ${response.statusText} for ${path}` +
          (body ? `: ${body.slice(0, 300)}` : ""),
      );
    }
    return response.json();
  };

  await runProofCheck({
    gather: () =>
      gatherProofFacts({
        getJson,
        repo: repo as string,
        sha: sha as string,
        requiredCheck: requiredCheck as string,
      }),
    repo: repo as string,
    sha: sha as string,
    requiredCheck: requiredCheck as string,
    writeOutput,
    writeSummary,
    log: (line) => process.stdout.write(`${line}\n`),
  });
}

// Only when run as a script, so importing it in a test does not fire a request.
if (process.argv[1] && process.argv[1].endsWith("check-merged-tree-proof.ts")) {
  void main();
}
