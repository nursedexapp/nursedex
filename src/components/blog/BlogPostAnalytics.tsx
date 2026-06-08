"use client";

import { useEffect, useRef } from "react";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface BlogPostAnalyticsProps {
  postId: string;
  slug: string;
  category: string | null;
}

/**
 * Fires a single blog_post_viewed event when a post page mounts (manual
 * page views: capture_pageview is off, see src/lib/posthog.ts). No-ops
 * until PostHog is initialized, matching the rest of the app's analytics.
 */
export function BlogPostAnalytics({
  postId,
  slug,
  category,
}: BlogPostAnalyticsProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !posthog.__loaded) return;
    fired.current = true;
    posthog.capture(ANALYTICS_EVENTS.BLOG_POST_VIEWED, {
      post_id: postId,
      slug,
      category: category ?? undefined,
    });
  }, [postId, slug, category]);

  return null;
}
