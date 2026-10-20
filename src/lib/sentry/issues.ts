import "server-only";
import * as Sentry from "@sentry/nextjs";

// Sentry's free plan has no native Slack/webhook alerting (that requires
// the paid Team tier, confirmed by the "Alert Rule Action" toggle being
// locked on a Custom Integration's webhook config on this account). This
// polls the Issues API instead. Query is a live "needs review" snapshot
// (not a first-seen time window) so a delayed/skipped poll can't lose
// issues, and an issue that regresses after being marked resolved still
// shows up. Cron/Stripe-webhook failures already alert via
// src/lib/cron/alerting.ts / the Stripe webhook route, so they're
// excluded here by the same tags those call sites set.
// If a class of event ever needs keeping out of this relay, exclude it by TAG
// as cron and stripe-webhook are, never by level. Measured on 2026-09-21:
// Sentry's issue search matches a GROUP when ANY event in it carries the
// value, so an issue that has ever held an error answers `level:[error,fatal]`
// for ever, and grouping keys on the stack trace, so rewording a message does
// not start a fresh group either.
export const NEEDS_REVIEW_QUERY =
  "is:for_review level:[error,fatal] !action:cron !action:stripe-webhook";

const API = "https://sentry.io/api/0";

// Safety backstop against a runaway pagination loop (e.g. a cursor that
// never actually terminates); at 100/page this is 500 issues in one poll,
// far beyond anything this project should ever see in a 15-minute window.
const MAX_PAGES = 5;

// Sentry's API gateway occasionally answers a single request "too many
// requests" when this job is nowhere near any limit (one request every 15
// minutes; NURSEDEX-SITE-H, 2026-10-19). One retry absorbs that blip, and a
// second refusal still throws so a real outage alerts on its first run. The
// retry is one per run, not per page, so the single capped wait is the most
// this can add to the route's 60 second maxDuration.
const RETRYABLE_STATUS = (status: number) => status === 429 || status >= 500;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 10_000;

function retryDelayMs(retryAfter: string | null): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

/**
 * Sentry itself could not answer: a server error that outlasted the retry, or
 * a connection that never got a reply. The route pages once per
 * outage for this rather than once per run, so it must stay distinct from a
 * failure that is ours to fix (a bad token, a missing setting), which still
 * pages every time.
 */
export class SentryUnavailableError extends Error {
  constructor(
    message: string,
    /** Sentry's status code, or null when nothing answered at all. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SentryUnavailableError";
  }
}

async function fetchOrUnavailable(url: string): Promise<Response> {
  // Outside the try: a missing token is ours to fix, not Sentry being down.
  const headers = authHeaders();
  try {
    return await fetch(url, { headers });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new SentryUnavailableError(
      `Sentry issues fetch got no answer: ${reason}`,
      null,
    );
  }
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SentryIssue {
  id: string;
  // Sentry's human-readable reference (e.g. "NURSEDEX-SITE-6"). Referencing
  // it as "Fixes NURSEDEX-SITE-6" in a commit message auto-closes the issue
  // in Sentry once that commit merges.
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  permalink: string;
}

function authHeaders(): Record<string, string> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error("Missing SENTRY_AUTH_TOKEN");
  return { Authorization: `Bearer ${token}` };
}

function nextCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    if (!/rel="next"/.test(part)) continue;
    if (!/results="true"/.test(part)) return null;
    const match = part.match(/cursor="([^"]+)"/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Issues currently needing review (new, regressed, or reoccurring),
 * excluding ones already alerted via the cron/Stripe-webhook paths.
 * Paginates until Sentry reports no further pages or MAX_PAGES is hit.
 * The whole run gets one retry on a 429 or 5xx (see RETRYABLE_STATUS).
 */
export async function getIssuesNeedingReview(
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<SentryIssue[]> {
  const sleep = deps.sleep ?? realSleep;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!org || !project) {
    throw new Error("Missing SENTRY_ORG or SENTRY_PROJECT");
  }

  const issues: SentryIssue[] = [];
  let cursor: string | null = null;
  let retried = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/projects/${org}/${project}/issues/`);
    url.searchParams.set("query", NEEDS_REVIEW_QUERY);
    url.searchParams.set("statsPeriod", "");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    let res = await fetchOrUnavailable(url.toString());
    if (!retried && RETRYABLE_STATUS(res.status)) {
      retried = true;
      // Counted, not just absorbed (L77): blips growing common should show
      // as a rising count here before they turn into pages. Tagged cron so
      // NEEDS_REVIEW_QUERY keeps it out of the relay it would otherwise feed.
      Sentry.captureMessage(
        `Sentry issues fetch refused with ${res.status}, retrying once`,
        { level: "warning", tags: { action: "cron", job: "sentry-alerts" } },
      );
      await sleep(retryDelayMs(res.headers.get("retry-after")));
      res = await fetchOrUnavailable(url.toString());
    }
    if (!res.ok) {
      const message = `Sentry issues fetch failed: ${res.status} ${await res.text()}`;
      // A 5xx only: a rate limit that outlasts the retry may be our own
      // over-use, so it is not announced as Sentry being down.
      if (res.status >= 500) {
        throw new SentryUnavailableError(message, res.status);
      }
      throw new Error(message);
    }

    const data = (await res.json()) as Array<{
      id: string;
      shortId: string;
      title: string;
      culprit: string;
      level: string;
      permalink: string;
    }>;
    issues.push(
      ...data.map((issue) => ({
        id: issue.id,
        shortId: issue.shortId,
        title: issue.title,
        culprit: issue.culprit,
        level: issue.level,
        permalink: issue.permalink,
      })),
    );

    cursor = nextCursor(res.headers.get("link"));
    if (!cursor) break;
  }

  return issues;
}
