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
 * A replay stopped on this page is started again rather than re-added. That
 * happens without a reload whenever PostHog was not running: Decline then
 * Accept on a page without PostHog, or the account setting turned off and on
 * again. Replay.start() records the whole session regardless of sampling, so a
 * restart samples the way a new replay would: the session rate decides whole
 * session recording, and otherwise it buffers for errors when the error rate
 * allows. getReplayId() is undefined exactly when the replay is not enabled
 * (@sentry-internal/replay 10.46, Replay.getReplayId).
 */
export function startSentryReplay(): void {
  const client = Sentry.getClient();
  if (!client) return;
  const replay = Sentry.getReplay();
  if (!replay) {
    Sentry.addIntegration(Sentry.replayIntegration());
    return;
  }
  if (replay.getReplayId() !== undefined) return;
  // The browser client's options; the shared type does not name the replay
  // rates, which only the browser SDK reads.
  const options = client.getOptions() as {
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
  };
  if (Math.random() < (options.replaysSessionSampleRate ?? 0)) replay.start();
  else if ((options.replaysOnErrorSampleRate ?? 0) > 0) replay.startBuffering();
}

/**
 * stop() flushes what was recorded and can reject; caught here so a failed
 * flush never reaches Sentry as an unhandled rejection of its own.
 */
export function stopSentryReplay(): void {
  Sentry.getReplay()
    ?.stop()
    .catch(() => {});
}
