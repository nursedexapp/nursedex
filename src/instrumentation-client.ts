import * as Sentry from "@sentry/nextjs";
import {
  IGNORED_BROWSER_ERRORS,
  IGNORED_BROWSER_FRAME_URLS,
} from "@/lib/sentry/ignored-browser-errors";

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
  // Errors thrown by an in-app browser's own injected script, not our code.
  // The list and the reasoning live beside it, with the behaviour asserted
  // against Sentry's own filter.
  ignoreErrors: IGNORED_BROWSER_ERRORS,
  // Errors whose throwing frame was loaded from a scheme we never serve, which
  // is how an in-app browser's injected script is told from our own code when
  // the message alone cannot do it (NURSEDEX-SITE-12).
  denyUrls: IGNORED_BROWSER_FRAME_URLS,
});

// Required by the SDK to instrument App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
