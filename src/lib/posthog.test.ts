// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// happy-dom (not jsdom, see vitest.config.ts) gives us a window so
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

  // #498. The privacy policy promised "you can opt out of analytics tracking by
  // enabling Do Not Track in your browser". PostHog defaults respect_dnt to
  // false, and we never set it, so that promise did nothing at all: a
  // privacy-conscious visitor who turned DNT on was tracked exactly the same.
  // A published policy asserting a control the code does not implement is the
  // problem, and honouring it is one line.
  it("honours Do Not Track, which the privacy policy promises", () => {
    initPostHog();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ respect_dnt: true }),
    );
  });

  // #499 / #379. Session replay is ON, and it is enabled from the PostHog
  // dashboard, which our code cannot see. rrweb masks form INPUTS by default but
  // not text RENDERED on the page, so replay was recording a family's revealed
  // nurse phone number and the admin panel's lists of user emails in readable
  // text.
  //
  // These options are pinned here, rather than left to PostHog's defaults, for
  // one reason: the defaults are not a promise. If a future posthog-js changes
  // them, or someone edits the recording config in the dashboard, the leak comes
  // back silently and the privacy policy becomes a lie again. Stating them in
  // code means a change has to go through a diff.
  it("masks every form input in session recordings", () => {
    initPostHog();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        session_recording: expect.objectContaining({ maskAllInputs: true }),
      }),
    );
  });

  it("pins the class that masks rendered PII, so replay records asterisks not phone numbers", () => {
    initPostHog();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        session_recording: expect.objectContaining({
          maskTextClass: "ph-mask",
          blockClass: "ph-no-capture",
        }),
      }),
    );
  });
});
