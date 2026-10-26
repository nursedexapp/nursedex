import * as Sentry from "@sentry/nextjs";
import {
  IGNORED_BROWSER_ERRORS,
  IGNORED_BROWSER_FRAME_URLS,
  dropEventsNotFromOurCode,
} from "@/lib/sentry/ignored-browser-errors";
import { installTranslationGuard } from "@/lib/dom/translation-guard";
import { createTranslationGuardReporter } from "@/lib/sentry/translation-guard-report";
import { analyticsAllowed } from "@/lib/consent/store";
import { startSentryReplay } from "@/lib/consent/sentry-replay";
import { tracesSampleRateFor } from "@/lib/sentry/traces-sample-rate";

// Must be NEXT_PUBLIC_-prefixed to be inlined into the client bundle; a
// bare SENTRY_DSN resolves to undefined in the browser and silently
// disables client-side error and replay capture (#395). Sentry DSNs are
// meant to be public (they're embedded in every client SDK by design),
// so exposing this one client-side isn't a secret-handling concern.
// NEXT_PUBLIC_VERCEL_ENV, not VERCEL_ENV, for the same reason: next.config.ts
// sets it from VERCEL_ENV at build time so Next inlines it here. A bare
// VERCEL_ENV read undefined in the browser and traced every page load.
const tracesSampleRate = tracesSampleRateFor(
  process.env.NEXT_PUBLIC_VERCEL_ENV,
);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // Errors thrown by an in-app browser's own injected script, not our code.
  // The list and the reasoning live beside it, with the behaviour asserted
  // against Sentry's own filter.
  ignoreErrors: IGNORED_BROWSER_ERRORS,
  // Errors whose throwing frame was loaded from a scheme we never serve, which
  // is how an in-app browser's injected script is told from our own code when
  // the message alone cannot do it (NURSEDEX-SITE-12).
  denyUrls: IGNORED_BROWSER_FRAME_URLS,
  // Errors from a program running our page inside Deno rather than a browser,
  // told by a Deno runtime frame anywhere in the stack (NURSEDEX-SITE-18), and
  // from a script a host app injected into the page, told by every frame
  // sitting on the document with none from our bundle (NURSEDEX-SITE-1B).
  beforeSend: dropEventsNotFromOurCode,
});

// Keeps the page working when the browser has machine translated it, which
// otherwise crashes React's next update of the translated text (#1240). It
// runs here, before the app's own code starts, so it is in place before React
// first touches the DOM.
installTranslationGuard(createTranslationGuardReporter());

// Replay records the session, so it waits for consent like PostHog. A visitor
// who accepted on an earlier visit gets it from the first frame; one who
// accepts now gets it from the banner (src/lib/consent/apply.ts).
if (analyticsAllowed()) startSentryReplay();

// Required by the SDK to instrument App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
