/**
 * CI entry point for the stale pull request report (#907).
 *
 * Reads the repo's own open pull requests and their check state, and posts one
 * Slack message naming any that have been waiting too long. Every decision it
 * makes lives in scripts/stale-prs.ts, which has tests; this file is the two
 * API reads and the send.
 *
 * IT DOES NOT FAIL THE JOB when it finds something. A stale PR is a thing for
 * a person to look at, not a broken build, and a workflow that goes red every
 * week for a backlog is one whose red stops meaning anything (L36, L538). A
 * failed READ does fail, because a report of "nothing stale" that could not
 * look is the exact defect this exists to remove (L98).
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name npx tsx scripts/check-stale-prs.ts
 */
import { selectStalePrs, summariseStalePrs, type PrRecord } from "./stale-prs";
import { announce } from "./slack-alert";

const REPO = process.env.GITHUB_REPOSITORY ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

/** The most pull requests one page can hold. More than this and we page. */
const PAGE_SIZE = 100;

export interface PullResponse {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  draft: boolean;
  user: { login: string; type: string } | null;
  head: { sha: string };
}

export interface CheckRunsResponse {
  check_runs?: Array<{ conclusion: string | null; status: string }>;
}

/** The one GitHub read, injected everywhere below so the shapes can be tested. */
export type ApiFn = <T>(path: string) => Promise<T>;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} for ${path}` +
        (body ? `: ${body.slice(0, 200)}` : ""),
    );
  }
  return (await res.json()) as T;
}

/**
 * Every open pull request, paged.
 *
 * A short page ends the loop, which is also what a truncated read looks like,
 * so this keeps asking until a page comes back short rather than assuming one
 * page is the lot. A repo with 101 open PRs would otherwise have its oldest
 * silently outside the report.
 */
export async function readOpenPulls(
  call: ApiFn,
  repo: string,
  pageSize = PAGE_SIZE,
): Promise<PullResponse[]> {
  const all: PullResponse[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await call<PullResponse[]>(
      `/repos/${repo}/pulls?state=open&per_page=${pageSize}&page=${page}`,
    );
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

/**
 * What a commit's check runs are saying, as a state.
 *
 * Pure, so every shape the API can hand back has a test rather than only the
 * one that happened to be live when this was written.
 */
export function checksFromRuns(runs: CheckRunsResponse): PrRecord["checks"] {
  const list = runs.check_runs ?? [];
  // No runs at all is not passing: it is a commit nothing judged.
  if (list.length === 0) return "unknown";
  if (
    list.some(
      (r) =>
        r.status === "completed" &&
        r.conclusion !== null &&
        !["success", "neutral", "skipped"].includes(r.conclusion),
    )
  ) {
    return "failing";
  }
  // Still going is not passing. On a pull request this old it means stuck, and
  // saying "checks passing" about a run nothing has judged is the reassuring
  // answer rather than the true one.
  if (list.some((r) => r.status !== "completed")) return "running";
  return "passing";
}

/**
 * What this PR's checks are saying.
 *
 * A read that fails answers "unknown" rather than throwing, because one
 * unreachable check API must not take the whole report down: the ages are
 * still worth reporting, and "unknown" is a state the message says out loud.
 */
export async function readChecks(
  call: ApiFn,
  repo: string,
  sha: string,
  log: (message: string, detail: unknown) => void = console.error,
): Promise<PrRecord["checks"]> {
  try {
    return checksFromRuns(
      await call<CheckRunsResponse>(
        `/repos/${repo}/commits/${sha}/check-runs?per_page=${PAGE_SIZE}`,
      ),
    );
  } catch (err) {
    // Answered rather than thrown: one unreachable check API must not take the
    // whole report down, because the ages are still worth reporting and
    // "unknown" is a state the message says out loud.
    log(
      `Could not read the checks for ${sha}:`,
      err instanceof Error ? err.message : err,
    );
    return "unknown";
  }
}

/** The author as the report groups them, bots under their app/ name. */
export function authorOf(user: PullResponse["user"]): string {
  if (!user) return "";
  // Bot logins come back without the app/ prefix the UI shows, so it is added
  // from the TYPE rather than matched on the name: a contributor called
  // "dependabot-helper" must not be grouped away as a bot.
  return user.type === "Bot"
    ? `app/${user.login.replace(/\[bot\]$/, "")}`
    : user.login;
}

/** One pull request in the shape the report reasons about. */
export function toRecord(
  pull: PullResponse,
  checks: PrRecord["checks"],
): PrRecord {
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    createdAt: pull.created_at,
    isDraft: pull.draft,
    author: authorOf(pull.user),
    checks,
  };
}

async function main(): Promise<void> {
  if (!REPO || !TOKEN) {
    // Refused, never skipped. A check that stands down quietly when its
    // credentials are absent reports healthy while measuring nothing.
    throw new Error(
      "GITHUB_REPOSITORY and GITHUB_TOKEN must both be set, or this reports " +
        "no stale pull requests without having looked at any.",
    );
  }

  const pulls = await readOpenPulls(api, REPO);

  const records: PrRecord[] = await Promise.all(
    pulls.map(async (p) =>
      toRecord(p, await readChecks(api, REPO, p.head.sha)),
    ),
  );

  const stale = selectStalePrs(records, new Date());
  const report = summariseStalePrs(stale, pulls.length);

  console.log(report);

  // Said every week, including the weeks nothing is stale. A report that only
  // speaks when it has something to say is indistinguishable from one that has
  // stopped running (L98), and this one is cheap enough to be heard from.
  await announce({
    title:
      stale.length === 0
        ? "Open pull requests: nothing stale"
        : "Pull requests have been open for weeks",
    report,
    token: process.env.SLACK_BOT_TOKEN,
  });
}

// Only when run directly, so the tests can import the pieces above.
if (process.argv[1]?.endsWith("check-stale-prs.ts")) {
  main().catch((err: unknown) => {
    console.error(
      "The stale pull request check could not run:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  });
}
