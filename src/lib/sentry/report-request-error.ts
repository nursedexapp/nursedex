export type RequestHeaders = NodeJS.Dict<string | string[]>;

export type ReportDecision =
  | { report: false; reason: string }
  | { report: true; error: unknown; level?: "warning" };

/**
 * next@16.3.4 throws this for ANY multipart POST to ANY page route, not only
 * for a stale action id: `areAllActionIdsValid` (server/app-render/action-
 * handler.js) returns `hasAtLeastOneAction`, false when the body carries no
 * `$ACTION_` field at all, and both of its call sites throw on exactly that.
 * Matched on the prefix because the rest of the message is a docs link that
 * can move between releases.
 *
 * The browser side twin of this filter is IGNORED_BROWSER_ERRORS in
 * ignored-browser-errors.ts, which cannot express this one: the discriminator
 * here is a request header, which no browser event carries.
 */
const ACTION_NOT_FOUND = "Failed to find Server Action";

function header(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name];
  // Node hands a repeated header over as a list. Origin is never legitimately
  // repeated, so the first is the only one worth reading.
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Was this request sent by a page of this same site?
 *
 * Every browser sends Origin on a POST, and a form on our own page sends our
 * own origin. Comparing it against the host the request actually arrived at,
 * rather than against a configured site URL, holds on production, on a preview
 * deployment and on localhost without any of them being listed anywhere.
 */
function isSameOrigin(headers: RequestHeaders): boolean {
  const origin = header(headers, "origin");
  if (!origin) return false;

  const scheme = header(headers, "x-forwarded-proto") ?? "http";
  const hosts = [
    header(headers, "host"),
    header(headers, "x-forwarded-host"),
  ].filter((host): host is string => Boolean(host));

  return hosts.some((host) => origin === `${scheme}://${host}`);
}

/**
 * Whether a Next.js request error is worth reporting, and as what.
 *
 * The one class handled specially here is the action-not-found error, and
 * NEITHER of its outcomes is "a real crash".
 *
 * A stale tab with JavaScript never reaches this code. In next@16.3.4 a fetch
 * action whose id is gone goes to `handleUnrecognizedFetchAction`, which sets
 * NEXT_ACTION_NOT_FOUND_HEADER and returns a 404 the client router turns into
 * a reload, without throwing. Both throw sites for this message sit in the
 * branch for a multipart POST that is NOT a fetch action. So what arrives here
 * is either a no-JS form post from a page older than the deployment, or junk,
 * and no header can separate them: every byte of a request is sender
 * controlled.
 *
 * So:
 *
 * - No same-origin Origin header: dropped. NURSEDEX-SITE-10 was seven forged
 *   multipart POSTs at the homepage from a rented server, each one an
 *   unhandled 500, a Sentry event and a Slack alert. This still costs a
 *   stranger nothing but one more curl flag, which is the point below.
 *
 * - Origin of this site: reported at `warning`, not error. NURSEDEX-SITE-11
 *   was two curl POSTs to `/?probe=...` on 2026-09-20 that simply SET that
 *   header, and were filed and relayed to Slack as genuine deployment skew.
 *   The sentry-alerts cron selects `level:[error,fatal]`, so warning keeps the
 *   volume visible in Sentry while taking the alert away from anyone with
 *   curl (L36).
 *
 * The message says Origin claimed this site rather than asserting a stale page
 * posted it, because the claim a check makes may not exceed what it measured
 * (L11), and this one measures a header the sender chose.
 */
export function decideRequestErrorReport(
  error: unknown,
  headers: RequestHeaders,
): ReportDecision {
  const isActionNotFound =
    error instanceof Error && error.message.startsWith(ACTION_NOT_FOUND);

  if (!isActionNotFound) return { report: true, error };

  if (!isSameOrigin(headers)) {
    return {
      report: false,
      reason:
        "a Server Action POST with no Origin of this site, which no browser on a page of ours sends",
    };
  }

  return {
    report: true,
    level: "warning",
    error: new Error(
      "Multipart POST naming no live Server Action, Origin claims this site (a forgeable header, so not proof of deployment skew)",
      { cause: error },
    ),
  };
}
