"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clearPostHogIdentity, initPostHog, posthog } from "@/lib/posthog";
import { useTrackingState } from "@/lib/consent/use-consent-state";
import { withdrawTracking } from "@/lib/consent/apply";
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
  const tracking = useTrackingState();
  const lastCaptured = useRef<string | null>(null);

  // Starts PostHog only once the answer is known and allows it. "unknown"
  // (hydration) never starts it, which is also what stops a second pageview
  // when the answer resolves after the first render. Declared before the
  // pageview effect so that, on Accept, PostHog is running before it captures.
  //
  // Not allowed means stop and forget, whether it never started or was just
  // withdrawn: Decline here, Decline in another tab, or the account setting
  // turned off anywhere. Another tab is heard only through a storage event,
  // and this page may already be running PostHog and Sentry replay, so both
  // stop in memory and PostHog's identity is removed, without a reload.
  // Once withdrawn on a page, PostHog stays stopped there until the next load,
  // even if tracking is allowed again: initPostHog never re-runs a loaded
  // PostHog, and that errs toward recording nothing.
  useEffect(() => {
    if (tracking === "unknown") return;
    if (tracking === "allowed") {
      initPostHog();
      return;
    }
    withdrawTracking();
    clearPostHogIdentity();
  }, [tracking]);

  useEffect(() => {
    if (tracking !== "allowed" || !posthog.__loaded || !analyticsAllowed())
      return;
    let url = window.location.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    if (lastCaptured.current === url) return;
    lastCaptured.current = url;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, tracking]);

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
