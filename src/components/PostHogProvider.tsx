"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, posthog } from "@/lib/posthog";

/**
 * Initializes PostHog on the client and captures a $pageview on each route
 * change. Pageview autocapture is off in posthog.ts ("we handle this
 * manually"), so without this nothing fires. No-ops when the env keys are
 * absent (initPostHog leaves posthog.__loaded false).
 */
function PostHogTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Init must run before the first pageview effect; effects in one component
  // run in declaration order, so the initial pageview is captured too.
  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!posthog.__loaded) return;
    let url = window.location.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

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
