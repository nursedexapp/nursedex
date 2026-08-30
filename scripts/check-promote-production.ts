// Promotes the staged production build for a merged commit, once the checks on
// that commit are green (#817, carrying out #801).
//
// Vercel builds a STAGED production deployment on every push to main and, with
// "Auto-assign Custom Production Domains" turned off, serves it to nobody. This
// is what puts it live.
//
// Deliberately a thin shell: the decision is in promote-production.ts and the
// HTTP is in promote-transport.ts, both driven by tests. What is left here is
// reading the environment and choosing an exit code.
import { appendFileSync } from "node:fs";
import { isFailure, missingSettings, runPromotion } from "./promote-production";
import {
  fetchChecks,
  fetchDeployments,
  postPromotion,
  type Fetcher,
} from "./promote-transport";

const REQUIRED_CHECKS = ["lint, typecheck, test", "authenticated e2e"];

function say(line: string): void {
  process.stdout.write(`${line}\n`);
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, `${line}\n`);
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.COMMIT_SHA;
  const githubToken = process.env.GITHUB_TOKEN;
  const vercelToken = process.env.VERCEL_TOKEN;

  const missing = missingSettings(process.env);

  if (missing.length > 0) {
    // Named individually: "something was missing" sends the reader back to
    // work out which (L11).
    say(`### Promotion not attempted\n\nNot configured: ${missing.join(", ")}.`);
    process.exit(1);
  }

  const outcome = await runPromotion({
    sha: sha as string,
    requiredChecks: REQUIRED_CHECKS,
    getChecks: () =>
      fetchChecks(fetch as Fetcher, repo as string, sha as string, githubToken as string),
    getDeployments: () =>
      fetchDeployments(fetch as Fetcher, sha as string, vercelToken as string),
    promote: (uid) => postPromotion(fetch as Fetcher, uid, vercelToken as string),
    say,
  });

  if (isFailure(outcome)) process.exit(1);
}

void main();
