// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// happy-dom (not jsdom, see vitest.config.ts) gives us a window so
// initPostHog doesn't bail on its server-side guard.
vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    init: vi.fn(),
    stopSessionRecording: vi.fn(),
    set_config: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

import posthog from "posthog-js";
import { initPostHog, clearPostHogIdentity, withdrawPostHog } from "./posthog";
import {
  writeConsent,
  setAccountAnalyticsOff,
  __resetConsentMemoryForTests,
} from "@/lib/consent/store";

describe("initPostHog", () => {
  beforeEach(() => {
    vi.mocked(posthog.init).mockClear();
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
    vi.mocked(posthog.stopSessionRecording).mockClear();
    vi.mocked(posthog.set_config).mockClear();
    vi.mocked(posthog.opt_out_capturing).mockClear();
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    Object.defineProperty(window.navigator, "globalPrivacyControl", {
      value: undefined,
      configurable: true,
    });
    writeConsent("accepted");
  });

  it("loads nothing before the visitor has answered", () => {
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("loads nothing after Decline", () => {
    writeConsent("declined");
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("loads nothing with Global Privacy Control, even after Accept", () => {
    Object.defineProperty(window.navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("loads nothing when the account has analytics off, even after Accept", () => {
    setAccountAnalyticsOff(true);
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
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

describe("withdrawPostHog", () => {
  beforeEach(() => {
    vi.mocked(posthog.stopSessionRecording).mockClear();
    vi.mocked(posthog.set_config).mockClear();
    vi.mocked(posthog.opt_out_capturing).mockClear();
  });

  it("stops recording and persistence on a running PostHog and asks for a reload", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;
    expect(withdrawPostHog()).toBe(true);
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(posthog.set_config).toHaveBeenCalledWith({ disable_persistence: true });
    // PostHog's own opt-out record may carry the ACCOUNT's choice: never touched here.
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("does nothing and needs no reload when PostHog never ran", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    expect(withdrawPostHog()).toBe(false);
    expect(posthog.stopSessionRecording).not.toHaveBeenCalled();
  });
});

describe("clearPostHogIdentity", () => {
  it("removes PostHog's visitor id and session but keeps its opt-out record and ours", () => {
    window.localStorage.setItem("ph_phc_test_posthog", "x");
    window.localStorage.setItem("__ph_opt_in_out_phc_test", "0");
    window.sessionStorage.setItem("ph_phc_test_window_id", "x");
    window.localStorage.setItem("nursedex_consent", "kept");
    document.cookie = "ph_phc_test_posthog=x; path=/";
    document.cookie = "sb-session=kept; path=/";

    clearPostHogIdentity();

    expect(window.localStorage.getItem("ph_phc_test_posthog")).toBeNull();
    expect(window.sessionStorage.getItem("ph_phc_test_window_id")).toBeNull();
    expect(window.localStorage.getItem("__ph_opt_in_out_phc_test")).toBe("0");
    expect(window.localStorage.getItem("nursedex_consent")).toBe("kept");
    expect(document.cookie).not.toContain("ph_phc_test_posthog");
    expect(document.cookie).toContain("sb-session=kept");
  });
});
