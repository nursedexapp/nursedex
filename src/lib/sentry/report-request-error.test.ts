// @vitest-environment node
import { describe, it, expect } from "vitest";
import { decideRequestErrorReport } from "./report-request-error";

/**
 * NURSEDEX-SITE-10. Seven multipart POSTs hit https://nursedex.com/ between
 * 02:44:41 and 02:44:44 UTC on 2026-09-20, each carrying about 135 KB of body,
 * and each raised an unhandled 500 that Sentry recorded and the 15 minute
 * sentry-alerts cron relayed to Slack at 10:45 PM.
 *
 * The error says deployment skew, and it is not: Skew Protection was on and
 * the release on every event was the build then live. next@16.3.4's
 * `areAllActionIdsValid` (server/app-render/action-handler.js) returns
 * `hasAtLeastOneAction`, which is false when the body carries no `$ACTION_`
 * field at all, and its two call sites throw on exactly that. So ANY multipart
 * POST to ANY page route raises it, with no action id and nothing stale.
 *
 * That makes the error reachable by anyone with curl, which means a stranger
 * can mint Sentry events and Slack alerts at will, and an alert that goes off
 * for nothing is how somebody learns to ignore the ones that matter (L36).
 *
 * The discriminator is the Origin header. A browser submitting a form posts
 * same origin and sends it; the seven forged requests sent neither Origin nor
 * Referer. Comparing Origin against the host the request arrived at, rather
 * than against a configured site URL, keeps this true on production, on a
 * preview deployment and on localhost alike.
 *
 * The headers below are copied from event f567087ae7d14bf4aa9cc0a960698b16
 * rather than invented, so the fixture is the thing that actually happened
 * (L48).
 */
const forgedUpload = {
  accept: "*/*",
  "accept-encoding": "gzip, deflate",
  connection: "close",
  "content-length": "138875",
  "content-type":
    "multipart/form-data; boundary=----WebKitFormBoundary898d17fb1f36d8c2",
  host: "nursedex.com",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  "x-forwarded-for": "45.3.34.27",
  "x-forwarded-host": "nursedex.com",
  "x-forwarded-proto": "https",
  "x-matched-path": "/",
};

// Verbatim from next@16.3.4, both throw sites.
const actionNotFound = () =>
  new Error(
    "Failed to find Server Action. This request might be from an older or newer deployment.\n" +
      "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
  );

describe("a request that no browser on this site sent", () => {
  it("drops the action error when the request carries no Origin", () => {
    const decision = decideRequestErrorReport(actionNotFound(), forgedUpload);

    expect(decision.report).toBe(false);
  });

  it("says why it dropped it, so a silent filter cannot be mistaken for a quiet week", () => {
    const decision = decideRequestErrorReport(actionNotFound(), forgedUpload);

    expect(decision.report === false && decision.reason).toContain("Origin");
  });

  it("drops the action error when the Origin is a different site", () => {
    const decision = decideRequestErrorReport(actionNotFound(), {
      ...forgedUpload,
      origin: "https://nursedex.com.attacker.example",
    });

    expect(decision.report).toBe(false);
  });

  it("still reports every other error from the very same request", () => {
    const other = new Error("Supabase read failed");

    const decision = decideRequestErrorReport(other, forgedUpload);

    expect(decision).toEqual({ report: true, error: other });
  });

  it("still reports a thrown value that is not an Error at all", () => {
    const decision = decideRequestErrorReport("boom", forgedUpload);

    expect(decision).toEqual({ report: true, error: "boom" });
  });
});

// Renamed from "a page on this site posting an action id the build no longer
// has". That framing was the reversed decision, not a passing detail: the
// block below only ever established that the request carries a same-origin
// Origin header, which the SITE-11 curl POSTs also carried. What it asserts is
// that such a request is still REPORTED (at warning, asserted further down),
// on every deployment shape.
describe("an action POST whose Origin claims this site", () => {
  it("reports it rather than dropping it", () => {
    const decision = decideRequestErrorReport(actionNotFound(), {
      ...forgedUpload,
      origin: "https://nursedex.com",
    });

    expect(decision.report).toBe(true);
  });

  it("reports it on a preview deployment, which is not the canonical host", () => {
    const decision = decideRequestErrorReport(actionNotFound(), {
      ...forgedUpload,
      host: "nursedex-q28u-l7p766b03-nursedexs-projects.vercel.app",
      origin: "https://nursedex-q28u-l7p766b03-nursedexs-projects.vercel.app",
    });

    expect(decision.report).toBe(true);
  });

  it("reports it in local development, where the scheme is http", () => {
    const decision = decideRequestErrorReport(actionNotFound(), {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "multipart/form-data; boundary=----x",
    });

    expect(decision.report).toBe(true);
  });

  it("reads an Origin that Node hands over as a list", () => {
    const decision = decideRequestErrorReport(actionNotFound(), {
      ...forgedUpload,
      origin: ["https://nursedex.com"],
    });

    expect(decision.report).toBe(true);
  });
});

/**
 * The Origin check above is not a check that a browser on our page sent the
 * request. Origin is a request header, so it is one `curl -H` away, and on
 * 2026-09-20 two multipart POSTs arrived at https://nursedex.com/?probe=... at
 * 14:36 and 15:19 UTC carrying `Origin: https://nursedex.com` and
 * `User-Agent: curl/8.7.1`. They were filed as NURSEDEX-SITE-11 under the
 * title claiming a page of this site posted them, and relayed to Slack.
 *
 * Two things follow, both read from next@16.3.4's action-handler.js:
 *
 * 1. A stale tab with JavaScript never reaches this code. `isFetchAction`
 *    requests go to `handleUnrecognizedFetchAction`, which console.warns, sets
 *    NEXT_ACTION_NOT_FOUND_HEADER and returns a 404 the client router turns
 *    into a reload. It does not throw, so it never reaches onRequestError.
 *    Both throw sites (lines 589 and 743) sit in the `else` branch: a
 *    multipart POST that is NOT a fetch action.
 *
 * 2. So the only genuine case left is a no-JS MPA form post from a page older
 *    than the deployment, and NOTHING in an HTTP request separates that from a
 *    forged one, because every byte of it is sender controlled.
 *
 * An error nobody can attribute and anybody can mint must not page us (L36),
 * and the message may claim only what the check measured (L11). It is reported
 * at `warning` instead: the sentry-alerts cron queries
 * `is:for_review level:[error,fatal]`, so warning stays visible in Sentry and
 * out of Slack.
 */
describe("a multipart POST naming no live Server Action", () => {
  const sameOrigin = { ...forgedUpload, origin: "https://nursedex.com" };

  it("reports it at warning, which the Slack alert query does not select", () => {
    const decision = decideRequestErrorReport(actionNotFound(), sameOrigin);

    expect(decision.report === true && decision.level).toBe("warning");
  });

  it("does not claim the poster was a page of this site, which Origin cannot show", () => {
    const decision = decideRequestErrorReport(actionNotFound(), sameOrigin);

    const message =
      decision.report === true ? (decision.error as Error).message : "";
    expect(message).not.toMatch(/posted by a page of this site/i);
  });

  it("names the forgeable header in the message, so the title carries its own caveat", () => {
    const decision = decideRequestErrorReport(actionNotFound(), sameOrigin);

    const message =
      decision.report === true ? (decision.error as Error).message : "";
    expect(message).toMatch(/origin/i);
  });

  it("keeps the original Next error as the cause", () => {
    const skew = actionNotFound();

    const decision = decideRequestErrorReport(skew, sameOrigin);

    expect(decision.report === true && (decision.error as Error).cause).toBe(
      skew,
    );
  });

  it("leaves every other error at its default level, so real crashes still page us", () => {
    const decision = decideRequestErrorReport(
      new Error("Supabase read failed"),
      sameOrigin,
    );

    expect(decision.report === true && decision.level).toBeUndefined();
  });
});
