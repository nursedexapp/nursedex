export type RequestHeaders = NodeJS.Dict<string | string[]>;

export type ReportDecision =
  | { report: false; reason: string }
  | { report: true; error: unknown };

/**
 * next@16.2.3 throws this for ANY multipart POST to ANY page route, not only
 * for a stale action id: `areAllActionIdsValid` returns false when the body
 * carries no `$ACTION_` field at all. Matched on the prefix because the rest
 * of the message is a docs link that can move between releases.
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
 * The one class filtered here is the action-not-found error arriving from
 * something that is not a page of this site (NURSEDEX-SITE-10: seven forged
 * multipart POSTs at the homepage from a rented server, each one an unhandled
 * 500, a Sentry event and a Slack alert). Left unfiltered, anyone with curl
 * owns the alerts channel and the Sentry quota.
 *
 * The same error from our own page is the genuine article, a person whose tab
 * predates the running deployment, and it is reported. It is reported under a
 * message of our own because the Slack alert carries only the issue title, so
 * the title is the only place the two cases can be told apart (L11).
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
    error: new Error(
      "Server Action id not found, posted by a page of this site that was loaded before the current deployment",
      { cause: error },
    ),
  };
}
