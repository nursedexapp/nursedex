import posthog from "posthog-js";
import { analyticsAllowed } from "@/lib/consent/store";
import { MASK_PII, BLOCK_PII } from "@/components/ui/private";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  // Nothing loads until this browser has accepted the banner, and never while
  // it sends Do Not Track or Global Privacy Control or the account has
  // analytics off. posthog-chokepoint.test.ts keeps this the only way in.
  if (!analyticsAllowed()) return;

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
 * Removes PostHog's visitor id and session from this browser, so somebody
 * who used the site before the banner existed, or who withdrew, does not keep
 * a PostHog cookie they did not agree to. Run whenever analytics are not
 * allowed: on a page load before anything could start PostHog, and right after
 * an in memory withdrawal, which has already turned PostHog's persistence off
 * so it cannot write the identity back.
 *
 * Only `ph_` keys. PostHog's opt-out record (`__ph_opt_in_out_*`) may hold the
 * ACCOUNT's choice, written by applyAnalyticsPreference, and deleting it on a
 * live page restarts capture (posthog-js consent.js re-reads it on every
 * call), so it is never touched.
 */
export function clearPostHogIdentity() {
  if (typeof window === "undefined") return;
  const isIdentityKey = (name: string) => name.startsWith("ph_");
  for (const getStore of [
    () => window.localStorage,
    () => window.sessionStorage,
  ]) {
    try {
      const store = getStore();
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && isIdentityKey(key)) doomed.push(key);
      }
      doomed.forEach((key) => store.removeItem(key));
    } catch {
      // Storage blocked: PostHog could not have written here either.
    }
  }
  // PostHog sets its cookie on the parent domain (cross_subdomain_cookie), so
  // expire it with and without a domain or the parent copy survives.
  const host = window.location.hostname;
  const parts = host.split(".");
  const parent =
    parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`;
  const expired = "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (!name || !isIdentityKey(name)) continue;
    document.cookie = `${name}${expired}`;
    document.cookie = `${name}${expired}; domain=${host}`;
    document.cookie = `${name}${expired}; domain=${parent}`;
  }
}

/**
 * Withdrawal on a page where PostHog is already running. Never
 * opt_out_capturing: it does not stop the recorder outside cookieless mode
 * (posthog-core.js:4067-4073), and it writes PostHog's own opt-out record,
 * which may hold the ACCOUNT's choice. So, in memory only: stop recording,
 * stop writing cookies, and drop every later event on this page.
 * capture_pageleave goes off, because PostHog's unload handler captures
 * $pageleave and sends it by beacon (posthog-core.js _handle_unload);
 * autocapture stops listening; and before_send rejects whatever else still
 * calls capture (heatmaps, exceptions, anything already wired): posthog-js
 * drops an event whose before_send returns null.
 *
 * Complete for the life of the page, so a tab that hears of a withdrawal made
 * in another tab stops here without reloading (withdrawTracking in
 * src/lib/consent/apply.ts). Returns true when PostHog was running, which is
 * when the tab that declined reloads.
 */
export function withdrawPostHog(): boolean {
  if (!posthog.__loaded) return false;
  posthog.stopSessionRecording();
  posthog.set_config({
    disable_persistence: true,
    capture_pageleave: false,
    autocapture: false,
    before_send: () => null,
  });
  return true;
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
