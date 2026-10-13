// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  clickAButton,
  postHogIdentityKeys,
  startRealPostHog,
} from "../../test/real-posthog";

/**
 * Withdrawal made in ANOTHER tab. Tab A declines (or the account turns
 * analytics off) and writes to localStorage; this tab only hears a storage
 * event. With PostHog already running here, that must stop everything on this
 * page in memory, with no reload (a background tab must never lose form
 * input), and remove PostHog's identity from the browser.
 *
 * Against the real posthog-js: what has to stop is the library's own
 * autocapture, pageleave and persistence, which a mock cannot show.
 */
const h = vi.hoisted(() => ({ replay: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/nurses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/consent/sentry-replay", () => ({
  startSentryReplay: () => h.replay.push("start"),
  stopSentryReplay: () => h.replay.push("stop"),
}));

import { PostHogProvider } from "./PostHogProvider";
import {
  ACCOUNT_OFF_KEY,
  CONSENT_STORAGE_KEY,
  __resetConsentMemoryForTests,
  writeConsent,
} from "@/lib/consent/store";

let ph: ReturnType<typeof startRealPostHog>;

beforeEach(() => {
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  h.replay = [];
  ph = startRealPostHog();
});

afterEach(() => {
  cleanup();
  ph.teardown();
});

const leave = () => window.dispatchEvent(new Event("pagehide"));

/** What the other tab's write looks like from here. */
function otherTabWrites(key: string, value: string) {
  window.localStorage.setItem(key, value);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  });
}

async function runningAndAccepted() {
  writeConsent("accepted");
  render(<PostHogProvider />);
  await act(async () => {});
  // Control: PostHog is running, captures the provider's pageview, events, autocapture and the unload
  // pageleave, sends them, and has written its identity. Leaving flushes the
  // queue, so what is sent after withdrawal can only be new.
  ph.posthog.capture("before_withdrawal");
  clickAButton();
  leave();
  expect(ph.captured).toEqual([
    "$pageview",
    "before_withdrawal",
    "$autocapture",
    "$pageleave",
  ]);
  expect(ph.sent.some((s) => s.startsWith("beacon:"))).toBe(true);
  expect(postHogIdentityKeys().length).toBeGreaterThan(0);
  ph.captured.length = 0;
  ph.sent.length = 0;
}

function expectNothingRunning() {
  ph.posthog.capture("after_withdrawal");
  clickAButton();
  leave();
  expect(ph.captured).toEqual([]);
  expect(ph.sent).toEqual([]);
  expect(postHogIdentityKeys()).toEqual([]);
  expect(h.replay).toContain("stop");
  // PostHog's own opt-out record may carry the ACCOUNT's choice: untouched.
  expect(ph.posthog.has_opted_out_capturing()).toBe(false);
}

describe("PostHogProvider, withdrawal from another tab", () => {
  it("stops everything when another tab declines", async () => {
    await runningAndAccepted();
    otherTabWrites(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ choice: "declined", at: Date.now() }),
    );
    expectNothingRunning();
  });

  it("stops everything when another tab turns the account setting off", async () => {
    await runningAndAccepted();
    otherTabWrites(ACCOUNT_OFF_KEY, "1");
    expectNothingRunning();
  });
});
