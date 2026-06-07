import "server-only";
import crypto from "node:crypto";

// Re-exported for existing imports from "@/lib/slack/client".
export { OPS_CHANNEL_ID } from "./constants";

const SLACK_API = "https://slack.com/api";

/**
 * Verify a request actually came from Slack using the v0 signing scheme:
 * HMAC-SHA256 over `v0:{timestamp}:{rawBody}` keyed by the signing secret,
 * compared against the X-Slack-Signature header in constant time. Rejects
 * requests whose timestamp is more than five minutes old (replay guard).
 *
 * Must be called with the raw, undecoded request body.
 */
export function verifySlackRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = crypto.createHmac("sha256", secret).update(base).digest("hex");
  const expected = `v0=${digest}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type SlackResponse = { ok: boolean; error?: string } & Record<string, unknown>;

/**
 * Call a Slack Web API method with the bot token. Throws if Slack returns
 * ok:false so callers do not silently swallow a misconfigured scope.
 */
export async function slackPost(
  method: string,
  payload: unknown,
): Promise<SlackResponse> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN");

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as SlackResponse;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}
