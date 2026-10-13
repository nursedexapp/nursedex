"use client";

import { useCaptureOnce } from "@/lib/analytics/use-capture-once";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface BlogPostAnalyticsProps {
  postId: string;
  slug: string;
  category: string | null;
}

/**
 * Sends blog_post_viewed once per post (manual page views: capture_pageview
 * is off, see src/lib/posthog.ts), including for a visitor who accepts the
 * cookie banner on the post.
 */
export function BlogPostAnalytics({
  postId,
  slug,
  category,
}: BlogPostAnalyticsProps) {
  useCaptureOnce(
    ANALYTICS_EVENTS.BLOG_POST_VIEWED,
    { post_id: postId, slug, category: category ?? undefined },
    postId,
  );

  return null;
}
