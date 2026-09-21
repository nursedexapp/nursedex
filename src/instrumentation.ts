import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { decideRequestErrorReport } from "@/lib/sentry/report-request-error";

// Next.js instrumentation hook: without this, sentry.server.config.ts and
// sentry.edge.config.ts are never imported, so Sentry.init never runs on
// the server or edge runtime and every Sentry.captureException call
// elsewhere in the app silently no-ops (#394).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Every server error Next.js catches arrives here on its way to Sentry, which
 * makes it the one place a forged request can be told from a real one: the
 * request and its headers are still in hand. See report-request-error.ts for
 * what is filtered and why (NURSEDEX-SITE-10).
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const decision = decideRequestErrorReport(error, request.headers);

  if (!decision.report) {
    // Not silent. A filter nobody can see working is indistinguishable from a
    // quiet week, and this one is the only thing standing between the alerts
    // channel and anyone with curl.
    console.warn(
      "[instrumentation] request error not reported:",
      decision.reason,
      request.method,
      request.path,
    );
    return;
  }

  const { error: reported, level } = decision;

  if (!level) {
    Sentry.captureRequestError(reported, request, context);
    return;
  }

  // Reported, but below the level src/lib/sentry/issues.ts selects on
  // (`level:[error,fatal]`), so it lands in Sentry without paging anyone.
  // captureRequestError forks the scope again internally; a forked scope
  // inherits the level, which src/instrumentation-level.test.ts asserts on the
  // finished event rather than on the call.
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    Sentry.captureRequestError(reported, request, context);
  });
};
