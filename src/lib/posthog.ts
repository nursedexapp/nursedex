import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  posthog.init(key, {
    // Send events to our same-origin reverse proxy (see next.config.ts) so ad
    // blockers don't drop them. ui_host keeps toolbar/links pointing at the
    // real PostHog app (us.i.posthog.com -> us.posthog.com).
    api_host: "/ingest",
    ui_host: host.replace(".i.posthog.com", ".posthog.com"),
    person_profiles: "identified_only",
    capture_pageview: false, // we handle this manually in the app
    capture_pageleave: true,
  });
}

/**
 * Drops the identified person and assigns a fresh anonymous id. Call on
 * sign-out so the next user on this device doesn't merge their events into
 * the previous user's PostHog person.
 */
export function resetPostHog() {
  if (posthog.__loaded) posthog.reset();
}

export { posthog };
