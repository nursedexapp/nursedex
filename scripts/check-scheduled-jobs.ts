/**
 * CI entry point for the scheduled job watchdog (#837, #757).
 *
 * Asks GitHub when each scheduled workflow last completed successfully ON ITS
 * SCHEDULE, and fails when any of them has been silent for longer than its own
 * cron allows. The reasoning, including how the interval is derived and why an
 * empty list is a failure, lives in scripts/scheduled-jobs.ts.
 *
 * `event=schedule` on purpose: a run somebody started by hand proves the job
 * still works, not that GitHub is still firing it, and a schedule GitHub has
 * disabled is precisely what this exists to catch.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name npx tsx scripts/check-scheduled-jobs.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectScheduledWorkflows,
  runScheduledJobCheck,
  type ScheduledJob,
} from "./scheduled-jobs";
import { announce } from "./slack-alert";

const WORKFLOW_DIR = join(".github", "workflows");

const REPO = process.env.GITHUB_REPOSITORY ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

interface WorkflowRunsResponse {
  workflow_runs?: Array<{ updated_at?: string; run_started_at?: string }>;
}

interface WorkflowResponse {
  created_at?: string;
}

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
 * Every scheduled workflow, with when its schedule last succeeded.
 *
 * A workflow the API cannot answer for throws rather than arriving as "never
 * ran": an unreadable answer and a dead job are different things, and only one
 * of them is fixed by re-enabling a schedule (L11).
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

  const scheduled = collectScheduledWorkflows(files);

  return Promise.all(
    scheduled.map(async (job): Promise<ScheduledJob> => {
      const runs = await api<WorkflowRunsResponse>(
        `/repos/${REPO}/actions/workflows/${job.source}/runs` +
          `?event=schedule&status=success&per_page=1`,
      );
      const latest = runs.workflow_runs?.[0];

      // A workflow with no scheduled run yet is judged from when it was
      // created, so adding one does not alert before its first firing.
      const workflow = latest
        ? null
        : await api<WorkflowResponse>(
            `/repos/${REPO}/actions/workflows/${job.source}`,
          );

      return {
        ...job,
        lastSuccessAt: latest?.updated_at ?? latest?.run_started_at ?? null,
        firstSeenAt: workflow?.created_at ?? null,
      };
    }),
  );
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
