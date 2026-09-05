/**
 * CI entry point for the scheduled job watchdog (#837, #757).
 *
 * Two sets of jobs, one question.
 *
 * GitHub's own scheduled workflows: when did each last complete successfully
 * ON ITS SCHEDULE. Vercel's crons: when did each last leave a heartbeat. Both
 * are judged against their own cron expression, and both fail when they have
 * been silent for longer than that allows. The reasoning, including how the
 * interval is derived and why an empty list is a failure, lives in
 * scripts/scheduled-jobs.ts.
 *
 * The Vercel half runs HERE rather than as a fourteenth cron, because a check
 * that runs on the same scheduler as the jobs it watches dies with them.
 *
 * `event=schedule` on purpose: a run somebody started by hand proves the job
 * still works, not that GitHub is still firing it, and a schedule GitHub has
 * disabled is precisely what this exists to catch.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name npx tsx scripts/check-scheduled-jobs.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachHeartbeats,
  collectVercelCronJobs,
  fetchHeartbeatRows,
  loadGitHubWorkflowJobs,
  parseMaxDurationSeconds,
  runScheduledJobCheck,
  selfWorkflowSource,
  type ScheduledJob,
} from "./scheduled-jobs";
import { announce } from "./slack-alert";

const WORKFLOW_DIR = join(".github", "workflows");

const REPO = process.env.GITHUB_REPOSITORY ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${response.status} ${response.statusText} for ${path}` +
        (body ? `: ${body.slice(0, 200)}` : ""),
    );
  }
  return (await response.json()) as T;
}

/**
 * Every scheduled workflow plus every Vercel cron, ready to be judged.
 *
 * The reading itself lives in scripts/scheduled-jobs.ts, where it can be
 * tested without a network. This is only the wiring: the repository, the
 * files on disk, a real GitHub GET, and which entry is this workflow itself.
 */
async function loadJobs(): Promise<ScheduledJob[]> {
  if (!REPO) throw new Error("GITHUB_REPOSITORY is not set");
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");

  const files = readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => ({
      path: join(WORKFLOW_DIR, f),
      contents: readFileSync(join(WORKFLOW_DIR, f), "utf8"),
    }));

  const workflows = await loadGitHubWorkflowJobs({
    repo: REPO,
    files,
    api,
    selfSource: selfWorkflowSource(process.env),
  });

  return [...workflows, ...(await loadVercelCronJobs())];
}

/** Where the heartbeats are read from. Public domain, not a secret. */
const HEARTBEAT_URL =
  process.env.HEARTBEAT_URL ?? "https://nursedex.com/api/internal/job-heartbeats";

/**
 * The Vercel crons and their heartbeats.
 *
 * Everything here throws rather than degrading. A read that failed and a job
 * that has stopped are different findings, and only one of them is fixed by
 * looking at the job (L11): reporting a failed fetch as thirteen dead crons
 * would send whoever reads the alert to the wrong place entirely.
 */
async function loadVercelCronJobs(): Promise<ScheduledJob[]> {
  const jobs = collectVercelCronJobs(readFileSync("vercel.json", "utf8"));

  const rows = await fetchHeartbeatRows({
    url: HEARTBEAT_URL,
    secret: process.env.HEARTBEAT_READ_SECRET,
  });

  // Each route declares its own maxDuration, so the budget a run is judged
  // against comes from the route rather than from a number repeated here (L41).
  const budgets: Record<string, number | null> = {};
  for (const job of jobs) {
    const routePath = join("src", "app", "api", "cron", job.name, "route.ts");
    const seconds = existsSync(routePath)
      ? parseMaxDurationSeconds(readFileSync(routePath, "utf8"))
      : null;
    budgets[job.name] = seconds === null ? null : seconds * 1000;
  }

  return attachHeartbeats(jobs, rows, budgets);
}

async function main(): Promise<void> {
  const code = await runScheduledJobCheck({
    loadJobs,
    announceImpl: announce,
    token: process.env.SLACK_BOT_TOKEN,
    log: (message) => console.log(message),
    now: Date.now(),
  });

  if (code !== 0) process.exit(code);
}

main().catch((err: unknown) => {
  console.error(
    "Scheduled job watchdog failed to run:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
