// @vitest-environment happy-dom
//
// Lessons review of #1173: an event a page sends once when it opens was lost
// for a visitor who accepted the banner on that page. The capture refused (no
// consent yet), the component kept it eligible, and nothing ever asked again,
// so the $pageview arrived on Accept and the page's own event never did. For
// the blog that is the post a search visitor landed on.
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  loaded: false,
  captured: [] as string[],
}));

vi.mock("@/lib/posthog", () => ({
  initPostHog: () => {
    h.loaded = true;
  },
  posthog: {
    get __loaded() {
      return h.loaded;
    },
    capture: (event: string) => {
      h.captured.push(event);
    },
  },
}));

import {
  writeConsent,
  __resetConsentMemoryForTests,
} from "@/lib/consent/store";
import { ANALYTICS_EVENTS } from "./events";
import { BlogPostAnalytics } from "@/components/blog/BlogPostAnalytics";
import { SearchAnalytics } from "@/components/nurses/SearchAnalytics";
import { SurveyResultsAnalytics } from "@/components/survey/SurveyResultsAnalytics";
import { CaptureOnMount } from "@/components/analytics/CaptureOnMount";
import { TrackedLink } from "@/components/analytics/TrackedLink";

const filters = { care_type: "pediatric" } as never;

const pages: [string, string, () => ReactElement][] = [
  [
    "a blog post",
    ANALYTICS_EVENTS.BLOG_POST_VIEWED,
    () => <BlogPostAnalytics postId="p1" slug="hire" category={null} />,
  ],
  [
    "directory results",
    ANALYTICS_EVENTS.SEARCH_PERFORMED,
    () => <SearchAnalytics filters={filters} resultCount={4} />,
  ],
  [
    "a nurse profile",
    ANALYTICS_EVENTS.PROFILE_VIEWED,
    () => (
      <CaptureOnMount
        event={ANALYTICS_EVENTS.PROFILE_VIEWED}
        dedupeKey="n1"
        properties={{ nurse_user_id: "n1" }}
      />
    ),
  ],
  [
    "a call to action already on screen",
    ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN,
    () => (
      <TrackedLink
        href="/nurses"
        seenEvent={ANALYTICS_EVENTS.HOMEPAGE_CTA_SEEN}
        clickedEvent={ANALYTICS_EVENTS.HOMEPAGE_CTA_CLICKED}
        properties={{ cta: "browse_nurses" }}
      >
        Browse nurses
      </TrackedLink>
    ),
  ],
  [
    "survey results",
    ANALYTICS_EVENTS.SURVEY_COMPLETED,
    () => <SurveyResultsAnalytics filters={filters} resultCount={4} />,
  ],
];

// A browser reports an element's current visibility as soon as it is
// observed, so a link already on screen is reported on screen at once.
class OnScreenObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", OnScreenObserver);
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  h.loaded = false;
  h.captured.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(pages)("the event %s sends when it opens", (_, event, page) => {
  it("is sent once when the visitor accepts on that page", () => {
    const { rerender } = render(page());
    expect(h.captured).toEqual([]);

    act(() => writeConsent("accepted"));
    expect(h.captured).toEqual([event]);

    rerender(page());
    expect(h.captured).toEqual([event]);
  });

  it("is never sent when the visitor declines on that page", () => {
    render(page());
    act(() => writeConsent("declined"));
    expect(h.captured).toEqual([]);
  });

  it("is sent once for a visitor who accepted before the page opened", () => {
    writeConsent("accepted");
    const { rerender } = render(page());
    rerender(page());
    expect(h.captured).toEqual([event]);
  });
});
