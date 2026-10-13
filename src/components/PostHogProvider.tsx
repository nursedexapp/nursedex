"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clearPostHogIdentity, initPostHog, posthog } from "@/lib/posthog";
import { useConsentState } from "@/lib/consent/use-consent-state";
import { analyticsAllowed } from "@/lib/consent/store";

/**
 * Starts PostHog on the client once this browser has accepted the cookie
 * banner, and captures a $pageview on each route change. Pageview autocapture
 * is off in posthog.ts ("we handle this manually"), so without this nothing
 * fires. No-ops when the env keys are absent (initPostHog leaves
 * posthog.__loaded false).
 */
function PostHogTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consent = useConsentState();
  const lastCaptured = useRef<string | null>(null);

  // Starts PostHog only once the answer is known and allows it. "unknown"
  // (hydration) never starts it, which is also what stops a second pageview
  // when the answer resolves after the first render. Declared before the
  // pageview effect so that, on Accept, PostHog is running before it captures.
  useEffect(() => {
    if (consent === "unknown") return;
    if (analyticsAllowed()) initPostHog();
    else if (!posthog.__loaded) clearPostHogIdentity();
  }, [consent]);

  useEffect(() => {
    if (consent !== "accepted" || !posthog.__loaded || !analyticsAllowed()) return;
    let url = window.location.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    if (lastCaptured.current === url) return;
    lastCaptured.current = url;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, consent]);

  return null;
}

export function PostHogProvider() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <PostHogTracker />
    </Suspense>
  );
}
