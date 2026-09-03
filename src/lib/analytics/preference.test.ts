// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("posthog-js", () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => false),
  },
}));

import posthog from "posthog-js";
import { applyAnalyticsPreference, browserSendsDoNotTrack } from "./preference";

/** happy-dom's navigator.doNotTrack is read-only, so it is redefined. */
function setDoNotTrack(value: string | null) {
  Object.defineProperty(window.navigator, "doNotTrack", {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  vi.mocked(posthog.opt_out_capturing).mockClear();
  vi.mocked(posthog.opt_in_capturing).mockClear();
  vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(false);
  (posthog as unknown as { __loaded: boolean }).__loaded = true;
  setDoNotTrack(null);
});

afterEach(() => {
  setDoNotTrack(null);
});

describe("applyAnalyticsPreference", () => {
  it("stops capturing for somebody who has opted out", () => {
    applyAnalyticsPreference(true);
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });

  it("resumes capturing for somebody who has opted back in", () => {
    // The control has to work in both directions or it is a one-way door: the
    // opt-out persists in the browser's own storage, so without this a person
    // who changed their mind would stay untracked on that device forever, and
    // the setting would silently disagree with reality.
    vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(true);
    applyAnalyticsPreference(false);
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
  });

  it("does not opt in over Do Not Track", () => {
    // The account setting and the browser setting are different promises, and
    // the browser's is the broader one. Opting in here because the account
    // flag is false would quietly undo a person's browser-level choice.
    setDoNotTrack("1");
    vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(true);
    applyAnalyticsPreference(false);
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("still opts OUT under Do Not Track, since that agrees with it", () => {
    setDoNotTrack("1");
    applyAnalyticsPreference(true);
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });

  it("does not opt in somebody who was never opted out", () => {
    // Calling opt_in_capturing on every page load writes a cookie saying an
    // explicit choice was made, which is not true.
    vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(false);
    applyAnalyticsPreference(false);
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("does nothing before PostHog has loaded", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    applyAnalyticsPreference(true);
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });
});

describe("browserSendsDoNotTrack", () => {
  it.each([
    ["1", true],
    ["yes", true],
    ["0", false],
    ["unspecified", false],
    [null, false],
  ])("reads %s as %s", (value, expected) => {
    setDoNotTrack(value);
    expect(browserSendsDoNotTrack()).toBe(expected);
  });
});
