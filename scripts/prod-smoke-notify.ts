/**
 * The alert path for the production permission check (#521).
 *
 * Deliberately does not reuse slackPost from src/lib/slack/client: that module
 * imports "server-only" and so only resolves inside the Next bundle. The guard
 * is there to keep the bot token out of anything client-side, so this sends its
 * own request rather than weakening it. The channel id is still imported, so
 * there is one source of truth for where alerts land.
 *
 * Best effort, but never quiet, and never fatal. A missing token is announced
 * rather than skipped in silence, and a Slack failure is logged rather than
 * thrown: the caller is a job that has just found a broken grant in production,
 * and it must live long enough to print it and exit non-zero. An alerter that
 * crashes the run it was reporting on destroys the very message it exists to
 * deliver.
 */
import { ALERTS_CHANNEL_ID } from "../src/lib/slack/constants";

const SLACK_POST_MESSAGE = "https://slack.com/api/chat.postMessage";

export interface AnnounceOptions {
  report: string;
  token: string | undefined;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export async function announce({
  report,
  token,
  fetchImpl = fetch,
  log = console.error,
}: AnnounceOptions): Promise<void> {
  if (!token) {
    log(
      "SLACK_BOT_TOKEN is not set, so no Slack alert was sent. The failing job is the only signal.",
    );
    return;
  }

  try {
    const res = await fetchImpl(SLACK_POST_MESSAGE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: ALERTS_CHANNEL_ID,
        text: `Production permission check failed\n\n${report}`,
      }),
    });

    // Slack answers 200 with ok:false for a bad token or channel, so the status
    // code alone does not mean the message arrived.
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      log(`Slack rejected the alert: ${data.error ?? "unknown error"}`);
    }
  } catch (err: unknown) {
    log(
      `Could not post the Slack alert: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
