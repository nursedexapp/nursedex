// src/lib/consent/store.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  CONSENT_TTL_MS,
  __resetConsentMemoryForTests,
  accountAnalyticsOff,
  analyticsAllowed,
  browserSendsPrivacySignal,
  currentConsentSnapshot,
  markShownCounted,
  readConsent,
  setAccountAnalyticsOff,
  shownCounted,
  writeConsent,
} from "./store";

const NOW = 1_800_000_000_000;

function setSignals({ dnt = null, gpc = undefined }: { dnt?: string | null; gpc?: boolean }) {
  Object.defineProperty(window.navigator, "doNotTrack", { value: dnt, configurable: true });
  Object.defineProperty(window.navigator, "globalPrivacyControl", { value: gpc, configurable: true });
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  setSignals({});
});

describe("readConsent", () => {
  it("is null when nothing is stored", () => {
    expect(readConsent(NOW)).toBeNull();
  });

  it("returns the answer and when it was given, inside 12 months", () => {
    writeConsent("accepted", NOW);
    expect(readConsent(NOW + CONSENT_TTL_MS - 1)).toEqual({ choice: "accepted", at: NOW });
  });

  it("expires at 12 months", () => {
    writeConsent("declined", NOW);
    expect(readConsent(NOW + CONSENT_TTL_MS)).toBeNull();
  });

  it.each([
    ["not json", "{"],
    ["unknown choice", JSON.stringify({ choice: "yes", at: NOW })],
    ["missing time", JSON.stringify({ choice: "accepted" })],
    ["time in the future", JSON.stringify({ choice: "accepted", at: NOW + 1 })],
  ])("treats %s as no answer, never as consent", (_label, raw) => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, raw);
    expect(readConsent(NOW)).toBeNull();
  });
});

describe("when the browser refuses storage", () => {
  beforeEach(() => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
  });

  it("still honours the answer for the life of the page", () => {
    writeConsent("declined", NOW);
    expect(readConsent(NOW)).toEqual({ choice: "declined", at: NOW });
    expect(currentConsentSnapshot(NOW)).toBe("declined");
  });

  it("never records a showing it could not store", () => {
    markShownCounted(NOW);
    expect(shownCounted(NOW)).toBe(true); // in memory for this page
    __resetConsentMemoryForTests();
    expect(shownCounted(NOW)).toBe(false);
  });
});

describe("writeConsent", () => {
  it("announces the change", () => {
    const heard = vi.fn();
    window.addEventListener(CONSENT_CHANGE_EVENT, heard);
    writeConsent("accepted", NOW);
    window.removeEventListener(CONSENT_CHANGE_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("browserSendsPrivacySignal", () => {
  it.each([
    [{ dnt: "1" }, true],
    [{ dnt: "yes" }, true],
    [{ dnt: "0" }, false],
    [{ dnt: "unspecified" }, false],
    [{ dnt: null }, false],
    [{ gpc: true }, true],
    [{ gpc: false }, false],
  ])("reads %o as %s", (signals, expected) => {
    setSignals(signals);
    expect(browserSendsPrivacySignal()).toBe(expected);
  });
});

describe("analyticsAllowed", () => {
  it("is false with no answer", () => {
    expect(analyticsAllowed(NOW)).toBe(false);
    expect(currentConsentSnapshot(NOW)).toBe("none");
  });

  it("is true after Accept", () => {
    writeConsent("accepted", NOW);
    expect(analyticsAllowed(NOW)).toBe(true);
  });

  it("is false after Decline", () => {
    writeConsent("declined", NOW);
    expect(analyticsAllowed(NOW)).toBe(false);
  });

  it("lets a browser signal outrank Accept", () => {
    writeConsent("accepted", NOW);
    setSignals({ gpc: true });
    expect(analyticsAllowed(NOW)).toBe(false);
    expect(currentConsentSnapshot(NOW)).toBe("signal");
  });

  it("lets the account setting outrank Accept, and announces the change", () => {
    writeConsent("accepted", NOW);
    const heard = vi.fn();
    window.addEventListener(CONSENT_CHANGE_EVENT, heard);
    setAccountAnalyticsOff(true);
    window.removeEventListener(CONSENT_CHANGE_EVENT, heard);
    expect(accountAnalyticsOff()).toBe(true);
    expect(analyticsAllowed(NOW)).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    setAccountAnalyticsOff(false);
    expect(analyticsAllowed(NOW)).toBe(true);
  });
});

describe("shownCounted", () => {
  it("is false until marked, then true for 12 months", () => {
    expect(shownCounted(NOW)).toBe(false);
    markShownCounted(NOW);
    expect(shownCounted(NOW + CONSENT_TTL_MS - 1)).toBe(true);
    expect(shownCounted(NOW + CONSENT_TTL_MS)).toBe(false);
  });
});
