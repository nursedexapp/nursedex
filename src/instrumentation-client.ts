import * as Sentry from "@sentry/nextjs";

// Must be NEXT_PUBLIC_-prefixed to be inlined into the client bundle; a
// bare SENTRY_DSN resolves to undefined in the browser and silently
// disables client-side error and replay capture (#395). Sentry DSNs are
// meant to be public (they're embedded in every client SDK by design),
// so exposing this one client-side isn't a secret-handling concern.
// See src/sentry.server.config.ts for why this isn't a flat 1.0.
const tracesSampleRate = process.env.VERCEL_ENV === "production" ? 0.1 : 1.0;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  // These originate from the host app's own injected script (e.g. Instagram's
  // in-app browser tearing down its native bridge on page unload), not our
  // code, and aren't actionable (NURSEDEX-SITE-5).
  ignoreErrors: [/Java object is gone/],
});

// Required by the SDK to instrument App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
