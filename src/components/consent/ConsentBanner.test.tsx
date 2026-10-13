// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ recorded: [] as string[], ok: true, running: false, reloads: 0 }));

vi.mock("@/lib/consent/actions", () => ({
  recordConsentEvent: async (kind: string) => {
    h.recorded.push(kind);
    return { ok: h.ok };
  },
}));
vi.mock("@/lib/posthog", () => ({
  initPostHog: () => {},
  withdrawPostHog: () => h.running,
}));
vi.mock("@/lib/consent/sentry-replay", () => ({
  startSentryReplay: () => {},
  stopSentryReplay: () => {},
}));

import { ConsentBanner } from "./ConsentBanner";
import {
  __resetConsentMemoryForTests,
  openConsentBanner,
  readConsent,
  shownCounted,
} from "@/lib/consent/store";

function setGpc(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "globalPrivacyControl", { value, configurable: true });
}

// happy-dom's localStorage is a proxy, so neither a spy on Storage.prototype
// reaches it nor vi.restoreAllMocks() undoes a spy on it. Restore by handle.
const storageSpies: Array<{ mockRestore: () => void }> = [];

function refuseStorage() {
  storageSpies.push(
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    }),
  );
  expect(() => window.localStorage.setItem("x", "y")).toThrow();
}

function restoreStorage() {
  while (storageSpies.length) storageSpies.pop()?.mockRestore();
}

// window.location.reload is not writable, so the whole location is swapped
// for one whose reload only counts, and put back after every test.
const realLocation = window.location;

beforeEach(() => {
  h.recorded = [];
  h.ok = true;
  h.running = false;
  h.reloads = 0;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  setGpc(undefined);
  delete document.documentElement.dataset.consentState;
  document.documentElement.style.removeProperty("--consent-bar-height");
  Object.defineProperty(window, "location", {
    value: {
      ...realLocation,
      reload: () => {
        h.reloads += 1;
      },
    },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  restoreStorage();
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

const bar = () => screen.queryByRole("region", { name: "Privacy choices" });

describe("ConsentBanner", () => {
  it("asks a visitor who has not answered and counts the showing once per browser", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await waitFor(() => expect(shownCounted()).toBe(true));
    expect(h.recorded).toEqual(["shown"]);
    cleanup();
    render(<ConsentBanner />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    expect(h.recorded).toEqual(["shown"]);
  });

  it("tries the showing again on the next page when the count failed (L368)", async () => {
    h.ok = false;
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown"]));
    expect(shownCounted()).toBe(false);
    cleanup();
    h.ok = true;
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown", "shown"]));
    await waitFor(() => expect(shownCounted()).toBe(true));
  });

  it("marks the page once it knows the answer, for the browser tests to wait on", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(document.documentElement.dataset.consentState).toBe("none"));
  });

  it("gives Decline and Accept the same visual weight", async () => {
    render(<ConsentBanner />);
    const decline = await screen.findByRole("button", { name: "Decline" });
    expect(decline.className).toBe(screen.getByRole("button", { name: "Accept" }).className);
  });

  it("links to the privacy policy", async () => {
    render(<ConsentBanner />);
    const link = await screen.findByRole("link", { name: "Privacy policy" });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("pads the page by its height while it shows, and stops when it closes", async () => {
    render(<ConsentBanner />);
    await screen.findByRole("button", { name: "Accept" });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--consent-bar-height")).toMatch(/^\d+px$/);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(root.style.getPropertyValue("--consent-bar-height")).toBe("");
  });

  it("Accept stores the answer, counts it, and closes", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(shownCounted()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()?.choice).toBe("accepted");
    await waitFor(() => expect(h.recorded).toEqual(["shown", "accepted"]));
    expect(bar()).not.toBeInTheDocument();
  });

  it("reopened, it names the current answer, and a change is not counted again", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(shownCounted()).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(h.recorded).toEqual(["shown", "declined"]));
    expect(bar()).not.toBeInTheDocument();
    act(() => openConsentBanner());
    expect(screen.getByText(/You declined on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()?.choice).toBe("accepted");
    expect(bar()).not.toBeInTheDocument();
    expect(h.recorded).toEqual(["shown", "declined"]);
  });

  it("reloads when Decline withdraws tracking that was already running", async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    h.running = true;
    act(() => openConsentBanner());
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(h.reloads).toBe(1);
  });

  it("does not reload when Decline had nothing to withdraw", async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(h.reloads).toBe(0);
  });

  it("closes even when the browser refuses storage", async () => {
    render(<ConsentBanner />);
    const decline = await screen.findByRole("button", { name: "Decline" });
    refuseStorage();
    fireEvent.click(decline);
    expect(bar()).not.toBeInTheDocument();
    expect(readConsent()?.choice).toBe("declined");
  });

  it("never asks a browser that sends Global Privacy Control, and says why when reopened", async () => {
    setGpc(true);
    render(<ConsentBanner />);
    await waitFor(() => expect(document.documentElement.dataset.consentState).toBe("signal"));
    expect(bar()).not.toBeInTheDocument();
    expect(h.recorded).toEqual([]);
    act(() => openConsentBanner());
    expect(screen.getByText(/browser asks sites not to track you/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bar()).not.toBeInTheDocument();
  });
});
