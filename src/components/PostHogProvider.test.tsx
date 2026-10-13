// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * The root provider starts PostHog and sends the pageviews. It must start
 * nothing until this browser has accepted the cookie banner, and the answer is
 * only known after hydration, so the hydration pass and the one after it must
 * between them send exactly one pageview, never two.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  pathname: "/nurses",
  posthog: { __loaded: false },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/posthog", async () => {
  const { analyticsAllowed } = await import("@/lib/consent/store");
  const posthog = Object.assign(h.posthog, {
    capture: (event: string, props?: { $current_url?: string }) =>
      h.calls.push(`capture:${event}:${props?.$current_url ?? ""}`),
    get_distinct_id: () => "anonymous",
    identify: (id: string) => h.calls.push(`identify:${id}`),
  });
  return {
    // The real one refuses until the browser accepted and the account allows it.
    initPostHog: () => {
      h.calls.push("init");
      if (!posthog.__loaded && analyticsAllowed()) {
        posthog.__loaded = true;
        h.calls.push("started");
      }
    },
    clearPostHogIdentity: () => h.calls.push("clear"),
    withdrawPostHog: () => posthog.__loaded,
    posthog,
  };
});

vi.mock("@/lib/consent/sentry-replay", () => ({
  startSentryReplay: () => h.calls.push("replay:start"),
  stopSentryReplay: () => h.calls.push("replay:stop"),
}));

// Stands in for the real one's device record, which is what the gate reads.
vi.mock("@/lib/analytics/preference", async () => {
  const { setAccountAnalyticsOff } = await import("@/lib/consent/store");
  return {
    applyAnalyticsPreference: (optedOut: boolean) =>
      setAccountAnalyticsOff(optedOut),
  };
});

import { PostHogProvider } from "./PostHogProvider";
import { PostHogIdentify } from "./PostHogIdentify";
import { applyConsentChoice } from "@/lib/consent/apply";
import {
  __resetConsentMemoryForTests,
  writeConsent,
} from "@/lib/consent/store";

const pageviews = () =>
  h.calls.filter((c) => c.startsWith("capture:$pageview"));

/** Server rendered, then hydrated, the way the root layout reaches a browser. */
function hydrate() {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<PostHogProvider />);
  document.body.appendChild(container);
  return render(<PostHogProvider />, { container, hydrate: true });
}

/** The dashboard: the root provider plus the signed in person's settings. */
function Dashboard({ analyticsOptOut }: { analyticsOptOut: boolean }) {
  return (
    <>
      <PostHogProvider />
      <PostHogIdentify userId="user-1" analyticsOptOut={analyticsOptOut} />
    </>
  );
}

beforeEach(() => {
  h.calls = [];
  h.pathname = "/nurses";
  h.posthog.__loaded = false;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
});

afterEach(cleanup);

describe("PostHogProvider", () => {
  it("sends exactly one pageview when the stored answer is accepted", async () => {
    writeConsent("accepted");
    hydrate();
    await act(async () => {});
    expect(pageviews()).toEqual([
      `capture:$pageview:${window.location.origin}/nurses`,
    ]);
  });

  it("starts nothing and clears PostHog's identity when the answer is declined", async () => {
    writeConsent("declined");
    hydrate();
    await act(async () => {});
    expect(h.posthog.__loaded).toBe(false);
    expect(pageviews()).toEqual([]);
    expect(h.calls).toContain("clear");
  });

  it("starts nothing before the visitor has answered", async () => {
    hydrate();
    await act(async () => {});
    expect(h.posthog.__loaded).toBe(false);
    expect(pageviews()).toEqual([]);
  });

  it("sends the pageview for the page the visitor accepted on", async () => {
    hydrate();
    await act(async () => {});
    act(() => writeConsent("accepted"));
    expect(h.posthog.__loaded).toBe(true);
    expect(pageviews()).toHaveLength(1);
  });

  it("sends one pageview per route change", async () => {
    writeConsent("accepted");
    const { rerender } = hydrate();
    await act(async () => {});
    h.pathname = "/blog";
    rerender(<PostHogProvider />);
    expect(pageviews()).toEqual([
      `capture:$pageview:${window.location.origin}/nurses`,
      `capture:$pageview:${window.location.origin}/blog`,
    ]);
  });

  it("never starts PostHog or sends a pageview for an opted out account that accepts the banner", async () => {
    render(<Dashboard analyticsOptOut />);
    await act(async () => {});
    act(() => {
      applyConsentChoice("accepted");
    });
    await act(async () => {});
    expect(h.calls).not.toContain("started");
    expect(h.calls).not.toContain("replay:start");
    expect(h.posthog.__loaded).toBe(false);
    expect(pageviews()).toEqual([]);
  });

  it("starts PostHog with one pageview for an account that allows it, once accepted", async () => {
    // The same path as above with the account allowing it, so the refusal
    // above is the account setting and not a broken path.
    render(<Dashboard analyticsOptOut={false} />);
    await act(async () => {});
    act(() => {
      applyConsentChoice("accepted");
    });
    await act(async () => {});
    expect(h.calls).toContain("started");
    expect(h.calls).toContain("replay:start");
    expect(pageviews()).toHaveLength(1);
  });
});
