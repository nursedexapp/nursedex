import "server-only";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { hasOptedOutOfAnalytics } from "./opt-out";

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

  // #715. The client-side opt-out cannot reach here: these calls fire from
  // Stripe webhooks and from auth paths, where the person's browser is not
  // involved at all. Without this check, opting out would quietly mean
  // "opted out of most tracking". The lookup fails closed, so a database it
  // cannot read stops the event rather than sending it anyway.
  if (await hasOptedOutOfAnalytics(args.distinctId)) return;

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

/**
 * Queue a capture to run AFTER the response, so analytics never sits on the
 * user's critical path (a login, a role choice, an email confirmation).
 *
 * `after()` THROWS when there is no request scope, and every call site here is
 * an auth path, so an unscheduled analytics call would take the login down
 * with it. That is the wrong trade in both directions, hence the catch: a lost
 * event is survivable, a login that 500s because of an analytics call is not.
 * The failure is logged rather than swallowed, so a systematic loss is visible
 * in the runtime logs instead of looking like an audience that stopped
 * signing up.
 */
export function captureServerEventAfterResponse(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): void {
  try {
    after(() => captureServerEvent(args));
  } catch (err) {
    console.error("[posthog-server] could not schedule", args.event, err);
  }
}
