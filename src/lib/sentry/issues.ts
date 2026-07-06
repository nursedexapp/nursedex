import "server-only";

// Sentry's free plan has no native Slack/webhook alerting (that requires
// the paid Team tier — confirmed by the "Alert Rule Action" toggle being
// locked on a Custom Integration's webhook config on this account). This
// polls the Issues API instead. Query is a live "needs review" snapshot
// (not a first-seen time window) so a delayed/skipped poll can't lose
// issues, and an issue that regresses after being marked resolved still
// shows up. Cron/Stripe-webhook failures already alert via
// src/lib/cron/alerting.ts / the Stripe webhook route, so they're
// excluded here by the same tags those call sites set.
const NEEDS_REVIEW_QUERY =
  "is:for_review level:[error,fatal] !action:cron !action:stripe-webhook";

const API = "https://sentry.io/api/0";

// Safety backstop against a runaway pagination loop (e.g. a cursor that
// never actually terminates); at 100/page this is 500 issues in one poll,
// far beyond anything this project should ever see in a 15-minute window.
const MAX_PAGES = 5;

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
 */
export async function getIssuesNeedingReview(): Promise<SentryIssue[]> {
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!org || !project) {
    throw new Error("Missing SENTRY_ORG or SENTRY_PROJECT");
  }

  const issues: SentryIssue[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/projects/${org}/${project}/issues/`);
    url.searchParams.set("query", NEEDS_REVIEW_QUERY);
    url.searchParams.set("statsPeriod", "");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(
        `Sentry issues fetch failed: ${res.status} ${await res.text()}`,
      );
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
