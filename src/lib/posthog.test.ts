// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// happy-dom (not jsdom — see vitest.config.ts) gives us a window so
// initPostHog doesn't bail on its server-side guard.
vi.mock("posthog-js", () => ({
  default: { __loaded: false, init: vi.fn() },
}));

import posthog from "posthog-js";
import { initPostHog } from "./posthog";

describe("initPostHog", () => {
  beforeEach(() => {
    vi.mocked(posthog.init).mockClear();
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  });

  it("sends events through the same-origin /ingest proxy", () => {
    initPostHog();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ api_host: "/ingest" }),
    );
  });

  it("keeps ui_host on the real PostHog app for toolbar links", () => {
    initPostHog();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ ui_host: "https://us.posthog.com" }),
    );
  });

  it("no-ops when the env keys are absent", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });
});
