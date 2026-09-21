export type RequestHeaders = NodeJS.Dict<string | string[]>;

export type ReportDecision =
  { report: false; reason: string } | { report: true; error: unknown };

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
 * Whether a Next.js request error is worth reporting.
 *
 * One class is dropped: the action-not-found error. It is unattributable,
 * unactionable, and anyone with curl can mint it, so it must never reach
 * Sentry or the Slack relay (L36).
 *
 * Unattributable. A stale tab WITH JavaScript never reaches this code. In
 * next@16.3.4 a fetch action whose id is gone goes to
 * `handleUnrecognizedFetchAction`, which sets NEXT_ACTION_NOT_FOUND_HEADER and
 * returns a 404 the client router turns into a reload, without throwing. Both
 * throw sites for this message sit in the branch for a multipart POST that is
 * NOT a fetch action. So what arrives is a no-JS form post from a page older
 * than the deployment, or junk, and no header separates them: every byte of a
 * request is chosen by the sender. The Origin header least of all, which
 * NURSEDEX-SITE-11 demonstrated: two `curl/8.7.1` POSTs simply set it and were
 * relayed to Slack as genuine deployment skew.
 *
 * Why it is DROPPED rather than reported quietly. #1098 lowered it to
 * `warning`, because the sentry-alerts cron selects `level:[error,fatal]`.
 * That did not work, measured at production on 2026-09-21: Sentry groups on
 * the stack trace, so the warning event joined the existing issue, and
 * Sentry's issue search matches a GROUP when ANY event in it carries the
 * value. A group that has ever held an error answers `level:[error,fatal]` for
 * ever, and rewording the message does not start a fresh group.
 *
 * The reason still names whether the sender claimed our Origin. It decides
 * nothing here, and it is kept because it is the one thing worth counting
 * about this traffic (#1091), not because it distinguishes a real case.
 */
export function decideRequestErrorReport(
  error: unknown,
  headers: RequestHeaders,
): ReportDecision {
  const isActionNotFound =
    error instanceof Error && error.message.startsWith(ACTION_NOT_FOUND);

  if (!isActionNotFound) return { report: true, error };

  return {
    report: false,
    reason: isSameOrigin(headers)
      ? "a multipart POST naming no live Server Action, sent with an Origin of this site, which is forgeable and so is not evidence of deployment skew"
      : "a multipart POST naming no live Server Action, sent with no Origin of this site",
  };
}
