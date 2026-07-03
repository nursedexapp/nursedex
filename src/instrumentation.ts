import * as Sentry from "@sentry/nextjs";

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

export const onRequestError = Sentry.captureRequestError;
