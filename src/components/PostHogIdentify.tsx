"use client";

import { useEffect } from "react";
import { initPostHog, posthog } from "@/lib/posthog";

/**
 * Links the PostHog person to our user id so client events (anonymous until
 * now) and server-side captures (webhook outcomes, keyed by user id) land on
 * the same person. identify() also merges the device's prior anonymous
 * history into the identified person, stitching pre-login events.
 *
 * Render from any layout or page that knows the logged-in user. Calling
 * initPostHog first covers the case where the root provider's init effect
 * hasn't run yet (it sits behind a Suspense boundary); both calls no-op when
 * already done.
 */
export function PostHogIdentify({
  userId,
  email,
}: {
  userId: string;
  email?: string;
}) {
  useEffect(() => {
    initPostHog();
    if (!posthog.__loaded) return;
    if (posthog.get_distinct_id() === userId) return;
    posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email]);

  return null;
}
