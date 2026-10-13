// src/lib/consent/sentry-replay.ts
import * as Sentry from "@sentry/nextjs";

/**
 * Session replay records what a visitor sees and does, so it waits for the
 * same consent as PostHog. Added at runtime rather than in Sentry.init; when
 * added it reads replaysSessionSampleRate and replaysOnErrorSampleRate from
 * the client's init options (replay afterAllSetup, verified in
 * @sentry-internal/replay 10.46), so the sampling in instrumentation-client.ts
 * still applies. Never re-added once present: Sentry throws on a second
 * instance. Error reports and tracing are not affected.
 *
 * There is no restart after a stop: withdrawal reloads the page, so a stopped
 * replay never needs to come back on the same page.
 */
export function startSentryReplay(): void {
  if (!Sentry.getClient()) return;
  if (Sentry.getReplay()) return;
  Sentry.addIntegration(Sentry.replayIntegration());
}

export function stopSentryReplay(): void {
  void Sentry.getReplay()?.stop();
}
