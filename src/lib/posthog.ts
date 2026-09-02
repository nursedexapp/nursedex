import posthog from "posthog-js";
import { MASK_PII, BLOCK_PII } from "@/components/ui/private";

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

    // The privacy policy promises "you can opt out of analytics tracking by
    // enabling Do Not Track in your browser". PostHog defaults respect_dnt to
    // false and we never set it, so for as long as that sentence has been
    // published the promise did nothing: a visitor who turned DNT on was tracked
    // exactly the same as one who did not (#498). Honouring it is one line, and
    // a policy that asserts a control the code does not implement is the kind of
    // thing that gets a company in trouble.
    respect_dnt: true,

    // Session replay is enabled from the PostHog dashboard, which this code
    // cannot read. These options are pinned here anyway, and that is the point:
    // the defaults are not a promise. A posthog-js release that changed them, or
    // someone editing the recording config in the dashboard, would silently start
    // recording personal data again and turn the privacy policy back into a lie.
    // Stated here, a change has to go through a diff and a test (#379, #499).
    session_recording: {
      // What people TYPE: license numbers, phone numbers, rates, passwords.
      // rrweb already defaults this to true; we say so out loud.
      maskAllInputs: true,
      // What we RENDER, which rrweb does NOT mask by default and which is where
      // the data was actually going. See src/components/ui/private.tsx.
      maskTextClass: MASK_PII,
      blockClass: BLOCK_PII,
    },
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
