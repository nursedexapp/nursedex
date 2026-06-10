import "server-only";
import { PostHog } from "posthog-node";

let cached: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;
  if (!cached) cached = new PostHog(key, { host });
  return cached;
}

/**
 * Server-side PostHog capture for events the client can't reliably see
 * (e.g. Stripe webhook outcomes). distinctId should be our user id, which
 * matches what PostHogIdentify sets on the client so events join the same
 * person. Sends immediately (no batching) since serverless functions freeze
 * after the response; never throws, analytics must not fail the caller.
 */
export async function captureServerEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.captureImmediate({
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties,
    });
  } catch (err) {
    console.error("[posthog-server]", args.event, err);
  }
}
