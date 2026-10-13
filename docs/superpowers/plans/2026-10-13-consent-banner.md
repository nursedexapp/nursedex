# Consent Banner Implementation Plan (revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No PostHog analytics, PostHog session recording, Sentry session replay or third party video player runs in a visitor's browser until that visitor has agreed to it.

**Architecture:** One client side consent store (`src/lib/consent/store.ts`) holds the banner answer (localStorage, with an in-memory fallback), the account's analytics setting as last seen on this device, and the browser's privacy signals. `analyticsAllowed()` is the single predicate. `initPostHog()` and `captureClientEvent()` are the only ways into PostHog and both check it; a scan enforces that. Sentry replay is added at runtime only when allowed. Withdrawing consent on a page where tracking already started stops recording and reloads, because posthog-js cannot be reliably stopped in memory. A daily anonymous tally feeds an accept rate on the admin page. Blog videos load their player only on click.

**Tech Stack:** Next.js 16.3 App Router, React 19.3, posthog-js 1.430.2, @sentry/nextjs 10.46, Supabase (service role), Vitest 5 + happy-dom + Testing Library, Playwright.

## Revision 2: what changed and why

Red team and lessons audit findings, each fixed in the design below:

| Finding | Fix (task) |
|---|---|
| Decline on a live page deleted PostHog's own opt-out record, so the in-memory instance resumed capturing and recording (posthog-js `consent.js:29-36`, `posthog-core.js:4192-4202`) | Withdrawal stops recording, disables persistence, and reloads; `__ph_*` keys are never deleted (T2, T6) |
| Sentry replay ignored the account setting; Decline wiped the account's opt-out on this device | Account setting cached on device and part of `analyticsAllowed()`; `__ph_*` kept (T1, T3, T6) |
| Storage refused: banner could never close, Accept did nothing | In-memory fallback the snapshot reads (T1) |
| Accept after Accept reloaded and lost unsaved form input | Accept never reloads (T6) |
| Two `$pageview` per load for returning visitors | Capture only when `consent === "accepted"`, dedupe by URL (T6) |
| Copy overclaimed: server account events, Sentry errors and tracing, video embeds | Copy says "in your browser" and discloses each (T6, T9) |
| Accept rate could exceed 100% | Showing and answers counted per browser per 12 month period, after a confirmed write; inconsistent counts render as an error (T1, T4) |
| Bar covered the dashboard nav, dialogs and page ends; existing e2e could flake | `z-40`, offset above the mobile nav, page padded by the bar's height, existing specs seeded with an answer (T6, T10) |
| Privacy text edit breaks `last-updated.test.ts` | Date and prose hash updated in the same commit (T9) |
| Merging before the migration trips migration drift | Dan applies 071 before merge (T11) |
| Admin page fails whole on a tally error | Section has its own error state (T7) |
| Tally silence indistinguishable from a quiet week | Weekly data drift check alerts on a week with no rows (T5) |
| Chokepoint scan matched one spelling; 9 files call `posthog.capture` directly | All capture goes through `captureClientEvent`; scan fails on any other `posthog-js` use (T2) |
| e2e negatives could pass before hydration; no replay proof | Wait on a hydration marker; each negative seen to fail; Sentry replay asserted with a positive control (T10) |
| Window mixed UTC and New York dates and was 31 days | One New York date helper (T4) |
| Reopened bar did not show the current answer | It names the answer and its date (T6) |
| Blog admin view counts drop with no marker | Caption on that page too (T7) |
| YouTube and Vimeo players load on page open | Click to load (T8) |

Pushed back, with reason:
- **Server side account events stay ungated by the banner** (audit 1 suggested skipping them on `Sec-GPC`). Dan decided this explicitly: they are first party records sent server to server, not interception of browser traffic. The copy now discloses them instead of denying them.
- **Bot filtering of the tally** is done by user agent only. It cannot catch a headless browser that lies; the ratio is admin only and labelled as approximate.

## Global Constraints

- Before Accept: no `posthog.init`, no `/ingest` request, no `ph_` cookie or storage key, no Sentry `replay_event`, no YouTube or Vimeo request. Sentry error reports and 10% performance tracing run for everyone.
- Do Not Track or Global Privacy Control counts as Decline: no banner, nothing loads, no Accept offered.
- Tracking requires ALL of: this browser's Accept, the account setting not off (as last seen on this device), no browser signal. The banner never writes the account setting.
- Server side events (`src/lib/analytics/server.ts`) are unchanged by the banner and gated only by the account setting.
- Non blocking bar, `z-40` (below dialogs and sheets at `z-50`), Decline and Accept with the same variant and size.
- A banner answer lasts 12 months (`CONSENT_TTL_MS`). "Privacy choices" in both footers reopens the bar.
- Tally: `shown`, `accepted`, `declined` per New York day; no identifier.
- Copy: no dashes as punctuation, no emoji, domain not interface (L604). Every DOM test file starts with `// @vitest-environment happy-dom`.
- Stage named paths only. Commit messages end with `Claude-Session: https://claude.ai/code/session_01Qts2FGNAa34fXEqDAhV6Jt`.
- Before Task 1: run `npm test` on `main` and record the executed test count for the comparison in Task 10 (L288).

---

### Task 1: Consent store

**Files:** Create `src/lib/consent/store.ts`, `src/lib/consent/store.test.ts`. Modify `src/lib/analytics/preference.ts` and `src/lib/analytics/preference.test.ts`.

**Produces:**
- `type ConsentChoice = "accepted" | "declined"`, `type ConsentRecord = { choice: ConsentChoice; at: number }`
- `type ConsentSnapshot = "signal" | "none" | "accepted" | "declined"`
- constants `CONSENT_STORAGE_KEY = "nursedex_consent"`, `CONSENT_SHOWN_KEY = "nursedex_consent_shown"`, `ACCOUNT_OFF_KEY = "nursedex_account_analytics_off"`, `CONSENT_TTL_MS`, `CONSENT_CHANGE_EVENT = "nursedex:consent-change"`, `CONSENT_OPEN_EVENT = "nursedex:consent-open"`
- `browserSendsPrivacySignal(): boolean`
- `readConsent(now?): ConsentRecord | null`, `writeConsent(choice, now?): void`
- `currentConsentSnapshot(now?): ConsentSnapshot`
- `accountAnalyticsOff(): boolean`, `setAccountAnalyticsOff(off: boolean): void`
- `analyticsAllowed(now?): boolean`
- `shownCounted(now?): boolean`, `markShownCounted(now?): void`
- `openConsentBanner(): void`
- `__resetConsentMemoryForTests(): void`

- [ ] **Step 1: Write the failing test**

```ts
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
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/consent/store.test.ts`
Expected: FAIL, cannot resolve `./store`.

- [ ] **Step 3: Implement**

```ts
// src/lib/consent/store.ts

/**
 * The visitor's answer to the cookie banner, kept in this browser.
 *
 * Analytics and session recording wait for an explicit Accept: loading a
 * tracking script the moment a page opens is what California wiretapping
 * claims are built on. So every uncertain case reads as "not allowed": no
 * answer, an unreadable one, an expired one, a browser privacy signal, or an
 * account that has turned analytics off.
 *
 * localStorage rather than a cookie, because a cookie the server reads would
 * force every public page to render dynamically (#430). When the browser
 * refuses storage the answer is kept in memory, so the page still honours it
 * and the bar can close; it is asked again on the next page load.
 */

export type ConsentChoice = "accepted" | "declined";
export type ConsentRecord = { choice: ConsentChoice; at: number };
export type ConsentSnapshot = "signal" | "none" | "accepted" | "declined";

export const CONSENT_STORAGE_KEY = "nursedex_consent";
export const CONSENT_SHOWN_KEY = "nursedex_consent_shown";
export const ACCOUNT_OFF_KEY = "nursedex_account_analytics_off";
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const CONSENT_CHANGE_EVENT = "nursedex:consent-change";
export const CONSENT_OPEN_EVENT = "nursedex:consent-open";

const memory: {
  consent: ConsentRecord | null;
  shownAt: number | null;
  accountOff: boolean | null;
} = { consent: null, shownAt: null, accountOff: null };

export function __resetConsentMemoryForTests(): void {
  memory.consent = null;
  memory.shownAt = null;
  memory.accountOff = null;
}

function getItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Refused: the in-memory copy carries this page.
  }
}

function announce(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  }
}

function withinTtl(at: unknown, now: number): at is number {
  return (
    typeof at === "number" &&
    Number.isFinite(at) &&
    at <= now &&
    now - at < CONSENT_TTL_MS
  );
}

/**
 * Do Not Track or Global Privacy Control: a standing "no" an Accept click
 * cannot override. California treats GPC as a binding opt-out, and the privacy
 * policy promises DNT is honoured (#498).
 */
export function browserSendsPrivacySignal(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & {
    msDoNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };
  if (nav.globalPrivacyControl === true) return true;
  return [
    nav.doNotTrack,
    (window as Window & { doNotTrack?: string | null }).doNotTrack,
    nav.msDoNotTrack,
  ].some((signal) => signal === "1" || signal === "yes");
}

function parseRecord(raw: string | null, now: number): ConsentRecord | null {
  if (!raw) return null;
  let parsed: { choice?: unknown; at?: unknown };
  try {
    parsed = JSON.parse(raw) as { choice?: unknown; at?: unknown };
  } catch {
    return null;
  }
  if (parsed.choice !== "accepted" && parsed.choice !== "declined") return null;
  if (!withinTtl(parsed.at, now)) return null;
  return { choice: parsed.choice, at: parsed.at };
}

export function readConsent(now: number = Date.now()): ConsentRecord | null {
  const stored = parseRecord(getItem(CONSENT_STORAGE_KEY), now);
  if (stored) return stored;
  if (memory.consent && withinTtl(memory.consent.at, now)) return memory.consent;
  return null;
}

export function writeConsent(choice: ConsentChoice, now: number = Date.now()): void {
  memory.consent = { choice, at: now };
  setItem(CONSENT_STORAGE_KEY, JSON.stringify(memory.consent));
  announce();
}

/**
 * The account's analytics setting as this device last saw it, written by
 * PostHogIdentify and the settings form. A brand new device has not seen it
 * yet; that gap is the one PostHogIdentify already names.
 */
export function accountAnalyticsOff(): boolean {
  if (getItem(ACCOUNT_OFF_KEY) === "1") return true;
  return memory.accountOff === true;
}

export function setAccountAnalyticsOff(off: boolean): void {
  if (accountAnalyticsOff() === off) return;
  memory.accountOff = off;
  setItem(ACCOUNT_OFF_KEY, off ? "1" : null);
  announce();
}

export function currentConsentSnapshot(now: number = Date.now()): ConsentSnapshot {
  if (browserSendsPrivacySignal()) return "signal";
  return readConsent(now)?.choice ?? "none";
}

/** The one predicate. Everything that tracks in the browser asks this. */
export function analyticsAllowed(now: number = Date.now()): boolean {
  return currentConsentSnapshot(now) === "accepted" && !accountAnalyticsOff();
}

/** Has this browser's showing of the bar been counted in this 12 month period? */
export function shownCounted(now: number = Date.now()): boolean {
  const raw = getItem(CONSENT_SHOWN_KEY);
  const stored = raw === null ? null : Number(raw);
  if (withinTtl(stored, now)) return true;
  return withinTtl(memory.shownAt, now);
}

/** Called only after the tally confirmed the count (L368). */
export function markShownCounted(now: number = Date.now()): void {
  memory.shownAt = now;
  setItem(CONSENT_SHOWN_KEY, String(now));
}

export function openConsentBanner(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
```

- [ ] **Step 4: Point the account preference at the shared signal check**

In `src/lib/analytics/preference.ts`: delete `browserSendsDoNotTrack` and its doc comment; add `import { browserSendsPrivacySignal, setAccountAnalyticsOff } from "@/lib/consent/store";`; replace the body of `applyAnalyticsPreference` with:

```ts
export function applyAnalyticsPreference(optedOut: boolean): void {
  // Recorded on this device first, so the banner's gate and Sentry replay
  // both see it, including on pages that never render PostHogIdentify.
  setAccountAnalyticsOff(optedOut);

  if (!posthog.__loaded) return;

  if (optedOut) {
    posthog.opt_out_capturing();
    return;
  }

  if (browserSendsPrivacySignal()) return;
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
}
```

In `preference.test.ts`: delete the `describe("browserSendsDoNotTrack")` block and its import; add `window.localStorage.clear()` and `__resetConsentMemoryForTests()` to its `beforeEach`; add:

```ts
it("records the account setting on this device even when PostHog never loaded", () => {
  (posthog as unknown as { __loaded: boolean }).__loaded = false;
  applyAnalyticsPreference(true);
  expect(accountAnalyticsOff()).toBe(true);
  applyAnalyticsPreference(false);
  expect(accountAnalyticsOff()).toBe(false);
});
```

Run: `grep -rn "browserSendsDoNotTrack" src` → expected no output.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/consent/store.test.ts src/lib/analytics/preference.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/consent/store.ts src/lib/consent/store.test.ts src/lib/analytics/preference.ts src/lib/analytics/preference.test.ts
git commit -m "Add the consent store and honour Global Privacy Control"
```

---

### Task 2: One way into PostHog, and it checks consent

**Files:** Modify `src/lib/posthog.ts`, `src/lib/posthog.test.ts`, `src/lib/analytics/capture.ts`, `src/lib/analytics/capture.test.ts`. Create `src/lib/posthog-chokepoint.test.ts`. Convert the direct captures listed in Step 5.

**Consumes:** `analyticsAllowed` (T1). **Produces:** `initPostHog()` (gated), `clearPostHogIdentity(): void`, `withdrawPostHog(): boolean` (true when PostHog was running and the caller must reload), `captureClientEvent()` (gated).

- [ ] **Step 1: Write the failing tests**

In `src/lib/posthog.test.ts`, change the mock to `default: { __loaded: false, init: vi.fn(), stopSessionRecording: vi.fn(), set_config: vi.fn(), opt_out_capturing: vi.fn() }`, import `{ initPostHog, clearPostHogIdentity, withdrawPostHog }` and `{ writeConsent, setAccountAnalyticsOff, __resetConsentMemoryForTests }`. In `beforeEach`, after the existing lines, add `window.localStorage.clear(); __resetConsentMemoryForTests(); Object.defineProperty(window.navigator, "globalPrivacyControl", { value: undefined, configurable: true }); writeConsent("accepted");` and clear the three new mocks. Add:

```ts
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
    Object.defineProperty(window.navigator, "globalPrivacyControl", { value: true, configurable: true });
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("loads nothing when the account has analytics off, even after Accept", () => {
    setAccountAnalyticsOff(true);
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

describe("withdrawPostHog", () => {
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
```

In `src/lib/analytics/capture.test.ts`, grant consent in `beforeEach` (`writeConsent("accepted")` after clearing storage and memory) and add:

```ts
it("refuses to capture without consent even when PostHog is already loaded", () => {
  (posthog as unknown as { __loaded: boolean }).__loaded = true;
  writeConsent("declined");
  expect(captureClientEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED)).toBe(false);
  expect(posthog.capture).not.toHaveBeenCalled();
});
```

(Read the existing file first and match its mock and import names; `posthog.capture` must be a `vi.fn()` in its mock.)

Create the scan, using the shared walker so it is not a second copy (L655):

```ts
// src/lib/posthog-chokepoint.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sourceFilesUnder, normalise } from "../../test/source-files";

/**
 * PostHog may only be started or written to through src/lib/posthog.ts and
 * src/lib/analytics/capture.ts, because those are where the consent gate is.
 * Any other import of posthog-js is a way around it (L247: enumerate the
 * capability, not one spelling of it).
 */
const ALLOWED = new Set([
  "src/lib/posthog.ts",
  "src/lib/analytics/capture.ts",
  "src/lib/analytics/preference.ts",
]);

function appFiles(): string[] {
  const files = sourceFilesUnder("src")
    .map(normalise)
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
  if (files.length === 0) throw new Error("scanned no files, so this guard proves nothing");
  return files;
}

describe("PostHog has one way in", () => {
  it("imports posthog-js only where the consent gate lives", () => {
    const offenders = appFiles().filter((file) => {
      if (ALLOWED.has(file)) return false;
      const text = readFileSync(file, "utf8");
      return /from\s+["']posthog-js(\/[\w-]+)?["']/.test(text) && !/import\s+type\s/.test(text.match(/.*from\s+["']posthog-js.*/)?.[0] ?? "");
    });
    expect(offenders).toEqual([]);
  });

  it("checks consent in initPostHog before init, and in captureClientEvent before capture", () => {
    const init = readFileSync("src/lib/posthog.ts", "utf8");
    expect(init.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(init.indexOf("analyticsAllowed()")).toBeLessThan(init.indexOf("posthog.init("));
    const capture = readFileSync("src/lib/analytics/capture.ts", "utf8");
    expect(capture.indexOf("analyticsAllowed()")).toBeGreaterThan(-1);
    expect(capture.indexOf("analyticsAllowed()")).toBeLessThan(capture.indexOf("posthog.capture("));
  });
});
```

Check the helper's exact exports and path first: `grep -n "^export" test/source-files.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/posthog.test.ts src/lib/analytics/capture.test.ts src/lib/posthog-chokepoint.test.ts`
Expected: FAIL. The new functions are missing; init is called without consent; the scan lists the files in Step 5 plus the PostHog provider and identify components.

- [ ] **Step 3: Implement in `src/lib/posthog.ts`**

```ts
import { analyticsAllowed } from "@/lib/consent/store";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  // Nothing loads until this browser has accepted the banner, and never while
  // it sends Do Not Track or Global Privacy Control or the account has
  // analytics off. posthog-chokepoint.test.ts keeps this the only way in.
  if (!analyticsAllowed()) return;

  // ...existing body unchanged
}

/**
 * Removes PostHog's visitor id and session from this browser, so somebody
 * who used the site before the banner existed, or who withdrew, does not keep
 * a PostHog cookie they did not agree to. Run on a page load where analytics
 * are not allowed, before anything could start PostHog.
 *
 * Only `ph_` keys. PostHog's opt-out record (`__ph_opt_in_out_*`) may hold the
 * ACCOUNT's choice, written by applyAnalyticsPreference, and deleting it on a
 * live page restarts capture (posthog-js consent.js re-reads it on every
 * call), so it is never touched.
 */
export function clearPostHogIdentity() {
  if (typeof window === "undefined") return;
  const isIdentityKey = (name: string) => name.startsWith("ph_");
  for (const getStore of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = getStore();
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && isIdentityKey(key)) doomed.push(key);
      }
      doomed.forEach((key) => store.removeItem(key));
    } catch {
      // Storage blocked: PostHog could not have written here either.
    }
  }
  // PostHog sets its cookie on the parent domain (cross_subdomain_cookie), so
  // expire it with and without a domain or the parent copy survives.
  const host = window.location.hostname;
  const parts = host.split(".");
  const parent = parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`;
  const expired = "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (!name || !isIdentityKey(name)) continue;
    document.cookie = `${name}${expired}`;
    document.cookie = `${name}${expired}; domain=${host}`;
    document.cookie = `${name}${expired}; domain=${parent}`;
  }
}

/**
 * Withdrawal on a page where PostHog is already running. posthog-js cannot be
 * reliably stopped in memory: opt_out_capturing does not stop the recorder
 * outside cookieless mode (posthog-core.js:4067-4073). So: stop recording and
 * stop it writing cookies now, and return true so the caller reloads. The next
 * load never starts PostHog and clears its identity.
 */
export function withdrawPostHog(): boolean {
  if (!posthog.__loaded) return false;
  posthog.stopSessionRecording();
  posthog.set_config({ disable_persistence: true });
  return true;
}
```

In `src/lib/analytics/capture.ts`, add `import { analyticsAllowed } from "@/lib/consent/store";` and make the first line of `captureClientEvent`:

```ts
  // Withdrawal reloads the page, but a click handler can still run between the
  // click and the reload; this keeps that window empty.
  if (!analyticsAllowed()) return false;
```

- [ ] **Step 4: Run the posthog and capture tests**

Run: `npx vitest run src/lib/posthog.test.ts src/lib/analytics/capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Route every direct capture through `captureClientEvent`**

In each file below, replace `posthog.capture(EVENT, props)` with `captureClientEvent(EVENT, props)` (import from `@/lib/analytics/capture`), delete any surrounding `if (posthog.__loaded)` check (`captureClientEvent` does it), and remove the now unused `posthog-js` or `@/lib/posthog` import:

| File | Lines (at plan time; re-derive with `grep -n "posthog.capture" <file>`) |
|---|---|
| `src/app/(dashboard)/dashboard/edit/ProfileEditForm.tsx` | 37, 50, 53, 227 |
| `src/components/nurses/SaveHeartButton.tsx` | 97 |
| `src/components/nurses/SearchAnalytics.tsx` | 29 |
| `src/components/reveals/RevealCTA.tsx` | 92, 126, 219 |
| `src/components/blog/BlogPostAnalytics.tsx` | 28 |
| `src/components/survey/SurveyWizard.tsx` | 80 |
| `src/components/pricing/CheckoutButton.tsx` | 55 |
| `src/components/survey/SurveyResultsAnalytics.tsx` | 27 |

Where a caller used the boolean of `posthog.__loaded` for something other than guarding the capture (read each site), keep that behaviour using `captureClientEvent`'s return value. `PostHogProvider`, `PostHogIdentify`, `SignOutButton` (`resetPostHog`) and any other file the scan lists must import from `@/lib/posthog` instead of `posthog-js`; `@/lib/posthog` re-exports `posthog` already.

- [ ] **Step 6: Run the scan and every affected test**

Run: `npx vitest run src/lib/posthog-chokepoint.test.ts src/lib/analytics src/components src/app && npx tsc --noEmit`
Expected: PASS, the scan lists nothing, no type errors. Where a component test asserted `posthog.capture` was called, change it to assert the `captureClientEvent` mock was called with the same arguments; do not delete the assertion.

- [ ] **Step 7: Commit**

```bash
git add src/lib/posthog.ts src/lib/posthog.test.ts src/lib/analytics/capture.ts src/lib/analytics/capture.test.ts src/lib/posthog-chokepoint.test.ts
git add <each file changed in Step 5 and its test, by name>
git commit -m "Gate PostHog on consent and route every capture through one place"
```

---

### Task 3: Sentry replay only when allowed

**Files:** Create `src/lib/consent/sentry-replay.ts`, `src/lib/consent/sentry-replay.test.ts`. Modify `src/instrumentation-client.ts`, `src/sentry-wiring.test.ts`.

**Produces:** `startSentryReplay(): void`, `stopSentryReplay(): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/consent/sentry-replay.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  client: {} as object | undefined,
  replay: undefined as { stop: () => Promise<void> } | undefined,
  added: [] as unknown[],
}));

vi.mock("@sentry/nextjs", () => ({
  getClient: () => h.client,
  getReplay: () => h.replay,
  replayIntegration: () => ({ name: "Replay" }),
  addIntegration: (i: unknown) => h.added.push(i),
}));

import { startSentryReplay, stopSentryReplay } from "./sentry-replay";

beforeEach(() => {
  h.client = {};
  h.replay = undefined;
  h.added = [];
});

describe("startSentryReplay", () => {
  it("adds the replay integration once", () => {
    startSentryReplay();
    expect(h.added).toEqual([{ name: "Replay" }]);
  });

  it("never adds a second one, which Sentry refuses with an error", () => {
    h.replay = { stop: vi.fn(async () => {}) };
    startSentryReplay();
    expect(h.added).toEqual([]);
  });

  it("does nothing when Sentry is not initialised", () => {
    h.client = undefined;
    startSentryReplay();
    expect(h.added).toEqual([]);
  });
});

describe("stopSentryReplay", () => {
  it("stops a running replay", () => {
    const stop = vi.fn(async () => {});
    h.replay = { stop };
    stopSentryReplay();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
```

Add to `src/sentry-wiring.test.ts` inside its `describe`:

```ts
  it("does not record replays before consent: replay is not in Sentry.init", () => {
    const source = read("src/instrumentation-client.ts");
    const start = source.indexOf("Sentry.init(");
    const init = source.slice(start, source.indexOf("});", start) + 3);
    expect(init).not.toMatch(/replayIntegration/);
    expect(init).toMatch(/replaysOnErrorSampleRate/);
  });

  it("starts replay only behind the consent check", () => {
    expect(read("src/instrumentation-client.ts")).toMatch(
      /if \(analyticsAllowed\(\)\) startSentryReplay\(\);/,
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/consent/sentry-replay.test.ts src/sentry-wiring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/consent/sentry-replay.ts
import * as Sentry from "@sentry/nextjs";

/**
 * Session replay records what a visitor sees and does, so it waits for the
 * same consent as PostHog. Added at runtime rather than in Sentry.init; when
 * added it reads replaysSessionSampleRate and replaysOnErrorSampleRate from
 * the client's init options (replay afterAllSetup, verified in
 * @sentry-internal/replay 10.46), so the sampling in instrumentation-client.ts
 * still applies. Never re-added once present: Sentry throws on a second
 * instance. Error reports and tracing are not affected.
 *
 * There is no restart after a stop: withdrawal reloads the page, so a stopped
 * replay never needs to come back on the same page.
 */
export function startSentryReplay(): void {
  if (!Sentry.getClient()) return;
  if (Sentry.getReplay()) return;
  Sentry.addIntegration(Sentry.replayIntegration());
}

export function stopSentryReplay(): void {
  void Sentry.getReplay()?.stop();
}
```

In `src/instrumentation-client.ts`: delete `integrations: [Sentry.replayIntegration()],`; add the imports and, after `Sentry.init({...});`:

```ts
import { analyticsAllowed } from "@/lib/consent/store";
import { startSentryReplay } from "@/lib/consent/sentry-replay";

// Replay records the session, so it waits for consent like PostHog. A visitor
// who accepted on an earlier visit gets it from the first frame; one who
// accepts now gets it from the banner (src/lib/consent/apply.ts).
if (analyticsAllowed()) startSentryReplay();
```

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run src/lib/consent/sentry-replay.test.ts src/sentry-wiring.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consent/sentry-replay.ts src/lib/consent/sentry-replay.test.ts src/instrumentation-client.ts src/sentry-wiring.test.ts
git commit -m "Start Sentry session replay only with consent"
```

---

### Task 4: The tally (table, server action, reader)

**Files:** Create `supabase/migrations/071_consent_tally.sql`, `src/lib/consent/kinds.ts`, `src/lib/consent/actions.ts`, `src/lib/consent/actions.test.ts`, `src/lib/admin/consent-tally.ts`, `src/lib/admin/consent-tally.test.ts`, `src/lib/dates/new-york-day.ts`, `src/lib/dates/new-york-day.test.ts`. (Check first: `grep -rln "America/New_York" src/lib | head`. If a New York date helper already exists, use it and skip creating one.)

**Produces:**
- `CONSENT_EVENT_KINDS`, `type ConsentEventKind`, `isConsentEventKind`
- `recordConsentEvent(kind): Promise<{ ok: boolean }>` (never throws)
- `newYorkDay(at: Date): string` (YYYY-MM-DD)
- `CONSENT_RATE_MIN_SHOWN = 20`
- `type ConsentTally = { status: "ok"; days: number; shown: number; accepted: number; declined: number; acceptRate: number | null } | { status: "error"; message: string }`
- `summariseConsentRows(rows: unknown, days: number): ConsentTally`
- `getConsentTally(days?: number, now?: Date): Promise<ConsentTally>` (never throws; error is a status)
- `consentNoteText(t: ConsentTally & { status: "ok" }): string`

- [ ] **Step 1: The migration**

```sql
-- supabase/migrations/071_consent_tally.sql
-- ============================================================
-- consent_tally
-- ============================================================
-- Once the cookie banner gates analytics, PostHog sees only visitors who
-- accepted, so every PostHog figure drops on launch day and reads like an
-- audience collapse. This counts, per New York day, browsers shown the
-- banner and each browser's first answer, so those figures can be read
-- against the share who accepted.
--
-- Three numbers per day: no visitor id, no IP, no cookie. Kinds match
-- CONSENT_EVENT_KINDS in src/lib/consent/kinds.ts.

CREATE TABLE public.consent_tally (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shown', 'accepted', 'declined')),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, kind)
);

-- 042 grants ALL on new public tables to anon and authenticated by default.
-- Only the service role touches this one, so take them back explicitly
-- rather than relying on RLS alone (L714).
ALTER TABLE public.consent_tally ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consent_tally FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.consent_tally TO service_role;

-- One atomic statement, so concurrent answers all count. A retried call
-- counts twice, which only nudges a ratio.
CREATE OR REPLACE FUNCTION public.increment_consent_tally(p_kind text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.consent_tally (day, kind, count)
  VALUES ((now() AT TIME ZONE 'America/New_York')::date, p_kind, 1)
  ON CONFLICT (day, kind)
  DO UPDATE SET count = public.consent_tally.count + 1;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_consent_tally(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_consent_tally(text) TO service_role;
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/dates/new-york-day.test.ts
import { describe, it, expect } from "vitest";
import { newYorkDay } from "./new-york-day";

describe("newYorkDay", () => {
  it("uses the New York calendar day, not UTC", () => {
    // 03:30 UTC on 14 Oct is 23:30 on 13 Oct in New York (EDT)
    expect(newYorkDay(new Date("2026-10-14T03:30:00Z"))).toBe("2026-10-13");
  });
  it("crosses into winter time correctly", () => {
    // 04:30 UTC on 2 Nov 2026 is 23:30 on 1 Nov in New York (EST)
    expect(newYorkDay(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01");
  });
});
```

```ts
// src/lib/consent/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), ua: "Mozilla/5.0 (Macintosh)" }));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc: h.rpc }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": h.ua }),
}));

import { recordConsentEvent } from "./actions";

beforeEach(() => {
  h.rpc.mockReset();
  h.ua = "Mozilla/5.0 (Macintosh)";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordConsentEvent", () => {
  it("increments the tally for a known kind", async () => {
    h.rpc.mockResolvedValue({ error: null });
    await expect(recordConsentEvent("accepted")).resolves.toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("increment_consent_tally", { p_kind: "accepted" });
  });

  it("refuses an unknown kind without touching the database", async () => {
    await expect(recordConsentEvent("bogus" as unknown as "shown")).resolves.toEqual({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not count a self declared crawler", async () => {
    h.ua = "Mozilla/5.0 (compatible; Googlebot/2.1)";
    await expect(recordConsentEvent("shown")).resolves.toEqual({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("reports a database error as a failure and logs it", async () => {
    h.rpc.mockResolvedValue({ error: { message: "permission denied" } });
    await expect(recordConsentEvent("shown")).resolves.toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it("reports a thrown client as a failure rather than throwing", async () => {
    h.rpc.mockRejectedValue(new Error("network"));
    await expect(recordConsentEvent("declined")).resolves.toEqual({ ok: false });
  });
});
```

```ts
// src/lib/admin/consent-tally.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  CONSENT_RATE_MIN_SHOWN,
  consentNoteText,
  summariseConsentRows,
} from "./consent-tally";

vi.mock("server-only", () => ({}));

describe("summariseConsentRows", () => {
  it("sums each kind and computes the rate", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: 30 },
      { day: "2026-10-15", kind: "shown", count: 10 },
      { day: "2026-10-14", kind: "accepted", count: 12 },
      { day: "2026-10-15", kind: "declined", count: 8 },
    ];
    expect(summariseConsentRows(rows, 30)).toEqual({
      status: "ok", days: 30, shown: 40, accepted: 12, declined: 8, acceptRate: 0.3,
    });
  });

  it("gives no rate below the minimum (L716)", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: CONSENT_RATE_MIN_SHOWN - 1 },
      { day: "2026-10-14", kind: "accepted", count: 5 },
    ];
    expect(summariseConsentRows(rows, 30)).toMatchObject({ status: "ok", acceptRate: null });
  });

  it("refuses counts where answers outnumber showings, rather than print a rate over 100% (L588)", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: 20 },
      { day: "2026-10-14", kind: "accepted", count: 18 },
      { day: "2026-10-14", kind: "declined", count: 5 },
    ];
    expect(summariseConsentRows(rows, 30).status).toBe("error");
  });

  it("skips malformed rows", () => {
    const rows = [{ day: "x", kind: "shown", count: "40" }, { day: "x", kind: "other", count: 4 }, null];
    expect(summariseConsentRows(rows, 30)).toMatchObject({ shown: 0, accepted: 0, declined: 0 });
  });
});

describe("consentNoteText", () => {
  it("says no browsers yet when nothing was counted", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 0, accepted: 0, declined: 0, acceptRate: null }))
      .toBe("No browsers have been shown the banner in the last 30 days. If the site had visitors in that time, the count is not being recorded.");
  });
  it("says when there are too few to read", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 5, accepted: 2, declined: 1, acceptRate: null }))
      .toBe("Too few browsers to read a rate yet (5 shown, 20 needed).");
  });
  it("states what was measured, and no more", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 200, accepted: 60, declined: 40, acceptRate: 0.3 }))
      .toBe("30% of browsers shown the banner in the last 30 days accepted on their first answer. PostHog figures since launch come only from browsers that accepted.");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/lib/dates/new-york-day.test.ts src/lib/consent/actions.test.ts src/lib/admin/consent-tally.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 4: Implement**

```ts
// src/lib/dates/new-york-day.ts
const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in New York as YYYY-MM-DD, matching the tally's `day`. */
export function newYorkDay(at: Date): string {
  return FORMAT.format(at);
}
```

```ts
// src/lib/consent/kinds.ts
/** What the banner tallies. The migration's CHECK constraint lists the same three. */
export const CONSENT_EVENT_KINDS = ["shown", "accepted", "declined"] as const;
export type ConsentEventKind = (typeof CONSENT_EVENT_KINDS)[number];

export function isConsentEventKind(value: unknown): value is ConsentEventKind {
  return (CONSENT_EVENT_KINDS as readonly unknown[]).includes(value);
}
```

```ts
// src/lib/consent/actions.ts
"use server";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isConsentEventKind, type ConsentEventKind } from "./kinds";

const SELF_DECLARED_BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

/**
 * Adds one to today's count for a banner event. Callable by anyone, signed in
 * or not, so it accepts only the three kinds, skips self declared crawlers,
 * and logs its failures rather than sending them to Sentry: a caller who can
 * trigger an error at will must not fill the alert channel (L498). Silence is
 * caught instead by the weekly data drift check (Task 5). The worst abuse is a
 * skewed admin only ratio.
 *
 * Never throws: the banner has already applied the answer locally.
 */
export async function recordConsentEvent(kind: ConsentEventKind): Promise<{ ok: boolean }> {
  if (!isConsentEventKind(kind)) return { ok: false };
  try {
    const ua = (await headers()).get("user-agent") ?? "";
    if (SELF_DECLARED_BOT.test(ua)) return { ok: false };
    const { error } = await createServiceRoleClient().rpc("increment_consent_tally", {
      p_kind: kind,
    });
    if (error) {
      console.error("[consent-tally] could not count", kind, error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[consent-tally] could not count", kind, err);
    return { ok: false };
  }
}
```

```ts
// src/lib/admin/consent-tally.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isConsentEventKind } from "@/lib/consent/kinds";
import { newYorkDay } from "@/lib/dates/new-york-day";

export type ConsentTally =
  | { status: "ok"; days: number; shown: number; accepted: number; declined: number; acceptRate: number | null }
  | { status: "error"; message: string };

export const CONSENT_RATE_MIN_SHOWN = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export function summariseConsentRows(rows: unknown, days: number): ConsentTally {
  const totals = { shown: 0, accepted: 0, declined: 0 };
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const { kind, count } = row as { kind?: unknown; count?: unknown };
      if (!isConsentEventKind(kind)) continue;
      if (typeof count !== "number" || !Number.isFinite(count)) continue;
      totals[kind] += count;
    }
  }
  // A browser's answer is counted only after its showing was (Task 6), so
  // answers outnumbering showings means the counting broke. Refuse it rather
  // than print a rate over 100% (L588).
  if (totals.accepted + totals.declined > totals.shown) {
    return {
      status: "error",
      message: `Answers (${totals.accepted + totals.declined}) outnumber showings (${totals.shown}), so the count is not trustworthy.`,
    };
  }
  const acceptRate = totals.shown >= CONSENT_RATE_MIN_SHOWN ? totals.accepted / totals.shown : null;
  return { status: "ok", days, ...totals, acceptRate };
}

/** Exactly `days` New York days ending today. Never throws: the section renders the error. */
export async function getConsentTally(days = 30, now: Date = new Date()): Promise<ConsentTally> {
  const since = newYorkDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  try {
    const { data, error } = await createServiceRoleClient()
      .from("consent_tally")
      .select("day, kind, count")
      .gte("day", since);
    if (error) {
      console.error("[consent-tally] could not read", error);
      return { status: "error", message: `The banner counts could not be read: ${error.message}` };
    }
    return summariseConsentRows(data ?? [], days);
  } catch (err) {
    console.error("[consent-tally] could not read", err);
    return { status: "error", message: "The banner counts could not be read." };
  }
}

export function consentNoteText(t: Extract<ConsentTally, { status: "ok" }>): string {
  if (t.shown === 0) {
    return `No browsers have been shown the banner in the last ${t.days} days. If the site had visitors in that time, the count is not being recorded.`;
  }
  if (t.acceptRate === null) {
    return `Too few browsers to read a rate yet (${t.shown} shown, ${CONSENT_RATE_MIN_SHOWN} needed).`;
  }
  return `${Math.round(t.acceptRate * 100)}% of browsers shown the banner in the last ${t.days} days accepted on their first answer. PostHog figures since launch come only from browsers that accepted.`;
}
```

Volume: at most 3 rows a day, 90 for 30 days, far under PostgREST's 1,000 row cap.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/dates src/lib/consent/actions.test.ts src/lib/admin/consent-tally.test.ts`
Expected: PASS.

- [ ] **Step 6: Grants, if local Supabase is up**

Run `npx supabase status`. If running: `npx supabase db reset && npm run test:rls:local`, expected PASS. If not, write "grants not measured locally" in the PR body (L411).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/071_consent_tally.sql src/lib/consent/kinds.ts src/lib/consent/actions.ts src/lib/consent/actions.test.ts src/lib/admin/consent-tally.ts src/lib/admin/consent-tally.test.ts src/lib/dates/new-york-day.ts src/lib/dates/new-york-day.test.ts
git commit -m "Count banner showings and first answers per day"
```

---

### Task 5: Alert when the tally goes silent

**Files:** Modify `src/app/api/cron/data-drift/route.ts` and `src/app/api/cron/data-drift/route.test.ts`.

A tally that stops writing reads as a quiet week (L13, L90). The weekly data drift run already alerts through Slack and records `last_result`; it gains one check.

- [ ] **Step 1: Write the failing test**

Read `route.test.ts` first and follow how it mocks the service role client and `slackPost`. Add a case where the `consent_tally` read for the last 7 New York days returns `[]` and assert the posted Slack text contains `*Cookie banner tally*` and `no rows in the last 7 days`; a case where it returns one row and assert no such section; and a case where the read errors and assert the run FAILS (throws through `withCronAlerting`) rather than reporting clean.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/cron/data-drift/route.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

In the route, after `zipDrift` is computed:

```ts
    // The banner tally logs its write failures instead of alerting (L498), so
    // a tally that broke for good would read as a quiet week. A whole week
    // with no row at all is the signal: the site always has some new browser.
    const tallySince = newYorkDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const { data: tallyRows, error: tallyError } = await createServiceRoleClient()
      .from("consent_tally")
      .select("day")
      .gte("day", tallySince)
      .limit(1);
    if (tallyError) {
      throw new Error(`consent_tally could not be read: ${tallyError.message}`);
    }
```

and with the other findings:

```ts
    if ((tallyRows ?? []).length === 0) {
      findings.push(
        "*Cookie banner tally* has no rows in the last 7 days, so showings and answers are not being counted. " +
          "Check the Vercel logs for `[consent-tally]`.",
      );
    }
```

Add `import { newYorkDay } from "@/lib/dates/new-york-day";`, and add `consentTallyRowsLast7d: (tallyRows ?? []).length` to the JSON it returns.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/api/cron/data-drift/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/data-drift/route.ts src/app/api/cron/data-drift/route.test.ts
git commit -m "Alert when the cookie banner tally stops recording"
```

---

### Task 6: The banner, the footer control, and wiring

**Files:** Create `src/lib/consent/use-consent-state.ts`, `src/lib/consent/apply.ts`, `src/lib/consent/apply.test.ts`, `src/components/consent/ConsentBanner.tsx`, `src/components/consent/ConsentBanner.test.tsx`, `src/components/consent/PrivacyChoicesButton.tsx`. Modify `src/components/PostHogProvider.tsx`, `src/components/PostHogIdentify.tsx`, `src/components/PostHogIdentify.test.tsx`, `src/app/layout.tsx`, `src/app/globals.css` (confirm the path with `ls src/app/*.css`), `src/components/dashboard/DashboardSidebar.tsx`, `src/components/shared/Footer.tsx`, `src/components/shared/AppFooter.tsx`.

**Produces:** `useConsentState(): "unknown" | ConsentSnapshot`; `applyConsentChoice(choice): { countAnswer: boolean; reload: boolean }`; `<ConsentBanner />`; `<PrivacyChoicesButton />`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/consent/apply.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as string[], running: false }));

vi.mock("@/lib/posthog", () => ({
  initPostHog: () => h.calls.push("posthog:init"),
  withdrawPostHog: () => {
    h.calls.push("posthog:withdraw");
    return h.running;
  },
}));
vi.mock("./sentry-replay", () => ({
  startSentryReplay: () => h.calls.push("replay:start"),
  stopSentryReplay: () => h.calls.push("replay:stop"),
}));

import { applyConsentChoice } from "./apply";
import { __resetConsentMemoryForTests, markShownCounted, readConsent } from "./store";

beforeEach(() => {
  h.calls = [];
  h.running = false;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
});

describe("applyConsentChoice", () => {
  it("Accept stores the answer and starts PostHog and replay, with no reload", () => {
    expect(applyConsentChoice("accepted").reload).toBe(false);
    expect(readConsent()?.choice).toBe("accepted");
    expect(h.calls).toEqual(["posthog:init", "replay:start"]);
  });

  it("Accept when already accepted changes nothing and never reloads", () => {
    applyConsentChoice("accepted");
    h.calls = [];
    expect(applyConsentChoice("accepted")).toEqual({ countAnswer: false, reload: false });
    expect(h.calls).toEqual([]);
  });

  it("Decline with nothing running stores the answer and needs no reload", () => {
    expect(applyConsentChoice("declined").reload).toBe(false);
    expect(readConsent()?.choice).toBe("declined");
    expect(h.calls).toEqual(["posthog:withdraw", "replay:stop"]);
  });

  it("Decline while PostHog is running asks for a reload", () => {
    applyConsentChoice("accepted");
    h.running = true;
    expect(applyConsentChoice("declined").reload).toBe(true);
  });

  it("counts an answer only when it is the first, and only when the showing was counted", () => {
    expect(applyConsentChoice("declined").countAnswer).toBe(false); // showing never counted
    window.localStorage.clear();
    __resetConsentMemoryForTests();
    markShownCounted();
    expect(applyConsentChoice("declined").countAnswer).toBe(true);
    expect(applyConsentChoice("accepted").countAnswer).toBe(false); // a change, not a first answer
  });
});
```

```tsx
// src/components/consent/ConsentBanner.test.tsx
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
import { __resetConsentMemoryForTests, openConsentBanner, readConsent } from "@/lib/consent/store";

function setGpc(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "globalPrivacyControl", { value, configurable: true });
}

beforeEach(() => {
  h.recorded = [];
  h.ok = true;
  h.running = false;
  h.reloads = 0;
  window.localStorage.clear();
  __resetConsentMemoryForTests();
  setGpc(undefined);
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: () => { h.reloads += 1; } },
    configurable: true,
  });
});
afterEach(cleanup);

const bar = () => screen.queryByRole("region", { name: "Privacy choices" });

describe("ConsentBanner", () => {
  it("asks a visitor who has not answered and counts the showing once per browser", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await waitFor(() => expect(h.recorded).toEqual(["shown"]));
    cleanup();
    render(<ConsentBanner />);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    expect(h.recorded).toEqual(["shown"]);
  });

  it("tries the showing again on the next page when the count failed (L368)", async () => {
    h.ok = false;
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown"]));
    cleanup();
    h.ok = true;
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown", "shown"]));
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

  it("Accept stores the answer, counts it, and closes", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown"]));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()?.choice).toBe("accepted");
    await waitFor(() => expect(h.recorded).toEqual(["shown", "accepted"]));
    expect(bar()).not.toBeInTheDocument();
  });

  it("reopened, it names the current answer, and a change is not counted again", async () => {
    render(<ConsentBanner />);
    await waitFor(() => expect(h.recorded).toEqual(["shown"]));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    act(() => openConsentBanner());
    expect(screen.getByText(/You declined on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(h.recorded).toEqual(["shown", "declined"]));
  });

  it("reloads when Decline withdraws tracking that was already running", async () => {
    render(<ConsentBanner />);
    await screen.findByRole("button", { name: "Accept" });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    h.running = true;
    act(() => openConsentBanner());
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(h.reloads).toBe(1);
  });

  it("closes even when the browser refuses storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("SecurityError"); });
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(bar()).not.toBeInTheDocument();
    vi.restoreAllMocks();
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
  });
});
```

In `src/components/PostHogIdentify.test.tsx`, mock the hook (`vi.mock("@/lib/consent/use-consent-state", () => ({ useConsentState: () => "accepted" }))`) and `@/lib/consent/sentry-replay` (record `stop` calls in `h.calls`), and add a case: with `analyticsOptOut: true`, `h.calls` contains `"replay:stop"`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/consent/apply.test.ts src/components/consent src/components/PostHogIdentify.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Hook and apply step**

```ts
// src/lib/consent/use-consent-state.ts
"use client";

import { useSyncExternalStore } from "react";
import {
  ACCOUNT_OFF_KEY,
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  currentConsentSnapshot,
  type ConsentSnapshot,
} from "./store";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === ACCOUNT_OFF_KEY) onChange();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * "unknown" on the server and during hydration, because the answer lives in
 * this browser. Nothing may treat "unknown" as consent. The snapshot is a
 * string, so it is stable between calls as React requires.
 */
export function useConsentState(): "unknown" | ConsentSnapshot {
  return useSyncExternalStore(subscribe, () => currentConsentSnapshot(), () => "unknown" as const);
}
```

```ts
// src/lib/consent/apply.ts
import { initPostHog, withdrawPostHog } from "@/lib/posthog";
import { startSentryReplay, stopSentryReplay } from "./sentry-replay";
import { readConsent, shownCounted, writeConsent, type ConsentChoice } from "./store";

/**
 * What Accept and Decline do in this browser.
 *
 * countAnswer: true only for this browser's first answer in the period, and
 * only if its showing was counted, so the tally's answers can never outnumber
 * its showings.
 *
 * reload: true only for Decline while PostHog is running on this page.
 * posthog-js cannot be fully stopped in memory, so the page reloads and the
 * next load never starts it. Accept never reloads, so unsaved form input is
 * never lost to it (L608).
 */
export function applyConsentChoice(choice: ConsentChoice): { countAnswer: boolean; reload: boolean } {
  const previous = readConsent();
  if (previous?.choice === choice) return { countAnswer: false, reload: false };

  const countAnswer = previous === null && shownCounted();
  writeConsent(choice);

  if (choice === "declined") {
    stopSentryReplay();
    const reload = withdrawPostHog();
    return { countAnswer, reload };
  }

  initPostHog();
  startSentryReplay();
  return { countAnswer, reload: false };
}
```

Note the call order in the Decline branch puts `stopSentryReplay` first; update the apply test's expected `h.calls` for Decline to `["replay:stop", "posthog:withdraw"]` to match.

- [ ] **Step 4: Banner and footer control**

```tsx
// src/components/consent/ConsentBanner.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordConsentEvent } from "@/lib/consent/actions";
import { applyConsentChoice } from "@/lib/consent/apply";
import {
  CONSENT_OPEN_EVENT,
  markShownCounted,
  readConsent,
  shownCounted,
  type ConsentChoice,
} from "@/lib/consent/store";
import { useConsentState } from "@/lib/consent/use-consent-state";

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * Asks before analytics, session recording or replay run in this browser.
 * Never blocking: ignoring it is a "no", because nothing loads until Accept.
 * Decline and Accept share one variant and size: California treats a
 * lopsided choice as a dark pattern that voids the consent.
 *
 * z-40 keeps it under dialogs and sheets (z-50). It sits above the dashboard's
 * mobile nav through --bottom-nav-height and pads the page by its own height
 * through --consent-bar-height (globals.css), so it never hides the end of a
 * page or the footer's Privacy choices control.
 */
export function ConsentBanner() {
  const state = useConsentState();
  const [reopened, setReopened] = useState(false);
  const counting = useRef(false);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  // For the browser tests: the answer is known only after hydration.
  useEffect(() => {
    if (state !== "unknown") document.documentElement.dataset.consentState = state;
  }, [state]);

  useEffect(() => {
    if (state !== "none" || shownCounted() || counting.current) return;
    counting.current = true;
    recordConsentEvent("shown")
      .then((result) => {
        if (result.ok) markShownCounted();
      })
      .catch(() => {})
      .finally(() => {
        counting.current = false;
      });
  }, [state]);

  const visible =
    state === "none" ||
    (reopened && (state === "accepted" || state === "declined" || state === "signal"));

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (!visible || !bar) {
      root.style.removeProperty("--consent-bar-height");
      return;
    }
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--consent-bar-height", `${bar.offsetHeight}px`);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-bar-height");
    };
  }, [visible]);

  if (!visible) return null;

  function choose(choice: ConsentChoice) {
    const { countAnswer, reload } = applyConsentChoice(choice);
    setReopened(false);
    if (countAnswer) recordConsentEvent(choice).catch(() => {});
    if (reload) window.location.reload();
  }

  const current = state === "accepted" || state === "declined" ? readConsent() : null;
  const policy = (
    <Link href="/privacy" className="text-teal underline underline-offset-2">
      Privacy policy
    </Link>
  );

  return (
    <section
      ref={barRef}
      role="region"
      aria-label="Privacy choices"
      className="border-sage-light/50 bg-warm-white fixed inset-x-0 bottom-[var(--bottom-nav-height,0px)] z-40 border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:px-6"
    >
      <div className="max-w-site font-body text-soft-black mx-auto flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        {state === "signal" ? (
          <p>
            Your browser asks sites not to track you, so NurseDex runs no
            analytics or session recording in it. {policy}
          </p>
        ) : (
          <p>
            {current
              ? `You ${current.choice} on ${DATE.format(current.at)}. `
              : null}
            We&apos;d like to run analytics and session recording in your
            browser to see where NurseDex is confusing and fix it. None of it
            runs unless you accept. {policy}
          </p>
        )}
        <div className="flex shrink-0 gap-2">
          {state === "signal" ? (
            <Button variant="outline" size="lg" onClick={() => setReopened(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" size="lg" onClick={() => choose("declined")}>
                Decline
              </Button>
              <Button variant="outline" size="lg" onClick={() => choose("accepted")}>
                Accept
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

```tsx
// src/components/consent/PrivacyChoicesButton.tsx
"use client";

import { openConsentBanner } from "@/lib/consent/store";

/** Reopens the consent bar from the footer, on any page. */
export function PrivacyChoicesButton() {
  return (
    <button
      type="button"
      onClick={openConsentBanner}
      className="hover:text-soft-black cursor-pointer underline underline-offset-2"
    >
      Privacy choices
    </button>
  );
}
```

- [ ] **Step 5: Layout, CSS, nav, footers**

`src/app/globals.css` (append):

```css
/* The consent bar pads the page by its own height while it shows, and sits
   above the dashboard's mobile bottom nav (DashboardSidebar, lg:hidden). */
body {
  padding-bottom: var(--consent-bar-height, 0px);
}
html:has([data-mobile-bottom-nav]) {
  --bottom-nav-height: 4rem;
}
@media (min-width: 64rem) {
  html:has([data-mobile-bottom-nav]) {
    --bottom-nav-height: 0px;
  }
}
```

Confirm `4rem` matches the nav's real height (`DashboardSidebar.tsx:96`, and the dashboard layout's `pb-16`) and that the `lg` breakpoint is 64rem in this Tailwind config (`grep -rn "breakpoint\|--breakpoint-lg" src/app/globals.css`); adjust both values to match what you read.

`src/components/dashboard/DashboardSidebar.tsx:96`: add `data-mobile-bottom-nav` to the mobile `<nav>`.

`src/app/layout.tsx`: import `ConsentBanner` and render `<ConsentBanner />` on the line after `<PostHogProvider />`.

`Footer.tsx` and `AppFooter.tsx`: render `<PrivacyChoicesButton />` immediately after the `Privacy Policy` link.

- [ ] **Step 6: Provider and identify react to consent**

`src/components/PostHogProvider.tsx` (replace `PostHogTracker`; import `posthog` from `@/lib/posthog`, which also clears identity):

```tsx
import { useRef } from "react";
import { clearPostHogIdentity, initPostHog, posthog } from "@/lib/posthog";
import { useConsentState } from "@/lib/consent/use-consent-state";
import { analyticsAllowed } from "@/lib/consent/store";

function PostHogTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consent = useConsentState();
  const lastCaptured = useRef<string | null>(null);

  // Starts PostHog only once the answer is known and allows it. "unknown"
  // (hydration) never starts it, which is also what stops a second pageview
  // when the answer resolves after the first render.
  useEffect(() => {
    if (consent === "unknown") return;
    if (analyticsAllowed()) initPostHog();
    else if (!posthog.__loaded) clearPostHogIdentity();
  }, [consent]);

  useEffect(() => {
    if (consent !== "accepted" || !posthog.__loaded || !analyticsAllowed()) return;
    let url = window.location.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    if (lastCaptured.current === url) return;
    lastCaptured.current = url;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, consent]);

  return null;
}
```

Order matters: the init effect is declared first, so on Accept it runs before the pageview effect in the same commit. Add a component test (`src/components/PostHogProvider.test.tsx`, mocking `@/lib/posthog` and `next/navigation`) asserting: with the stored answer "accepted", one render pass plus the hydration re-render produce exactly one `$pageview`; with "declined", none, and `clearPostHogIdentity` is called.

`src/components/PostHogIdentify.tsx`: add `const consent = useConsentState();`, add `consent` to the effect's dependencies, import `stopSentryReplay`, and at the top of the effect (before `initPostHog()`) add:

```ts
    if (analyticsOptOut) stopSentryReplay();
```

`applyAnalyticsPreference` (Task 1) now records the setting on the device, so `initPostHog` refuses for an opted out account from then on. Add a sentence to the doc comment: "It also waits for the cookie banner: initPostHog refuses until this browser has accepted and the account allows it, and the effect re-runs when either changes."

`src/app/(dashboard)/dashboard/settings/SettingsForm.tsx:109` already calls `applyAnalyticsPreference(optOut)`, which now also stops replay through the store's change event only if something listens; add `if (optOut) stopSentryReplay();` right after that call.

- [ ] **Step 7: Run tests and types**

Run: `npx vitest run src/lib/consent src/components/consent src/components/PostHogIdentify.test.tsx src/components/PostHogProvider.test.tsx src/lib/posthog.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/consent/use-consent-state.ts src/lib/consent/apply.ts src/lib/consent/apply.test.ts src/components/consent src/components/PostHogProvider.tsx src/components/PostHogProvider.test.tsx src/components/PostHogIdentify.tsx src/components/PostHogIdentify.test.tsx src/app/layout.tsx src/app/globals.css src/components/dashboard/DashboardSidebar.tsx src/components/shared/Footer.tsx src/components/shared/AppFooter.tsx "src/app/(dashboard)/dashboard/settings/SettingsForm.tsx"
git commit -m "Ask before analytics: consent banner and privacy choices"
```

---

### Task 7: Admin surfaces say what the numbers now cover

**Files:** Modify `src/app/(admin)/admin/analytics/page.tsx`, `src/app/(admin)/admin/blog/page.tsx`. Create `src/lib/analytics/consent-launch.ts` and its test.

**Produces:** `CONSENT_LAUNCH_DATE: string | null` (set to the production launch date in Task 11), `postHogCoverageCaption(): string | null`.

- [ ] **Step 1: Failing test**

```ts
// src/lib/analytics/consent-launch.test.ts
import { describe, it, expect } from "vitest";
import { postHogCoverageCaption } from "./consent-launch";

describe("postHogCoverageCaption", () => {
  it("names the launch date and who is counted after it", () => {
    expect(postHogCoverageCaption("2026-10-20")).toBe(
      "From 20 October 2026, PostHog counts only browsers that accepted the cookie banner.",
    );
  });
  it("says nothing before launch", () => {
    expect(postHogCoverageCaption(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/analytics/consent-launch.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/analytics/consent-launch.ts
/**
 * The day the cookie banner went live in production. Every PostHog number
 * after it counts only browsers that accepted (L683), so each surface that
 * shows a PostHog number carries this caption. Set in the launch step.
 */
export const CONSENT_LAUNCH_DATE: string | null = null;

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export function postHogCoverageCaption(launch: string | null = CONSENT_LAUNCH_DATE): string | null {
  if (!launch) return null;
  return `From ${FORMAT.format(new Date(`${launch}T00:00:00Z`))}, PostHog counts only browsers that accepted the cookie banner.`;
}
```

Analytics page: fetch `getConsentTally(30)` in the existing `Promise.all` (it never throws), and after the Signups `</Section>` add:

```tsx
      <Section title="Cookie banner, last 30 days">
        {consent.status === "error" ? (
          <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {consent.message}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat icon={<Cookie className="size-4" />} label="Browsers shown" value={consent.shown} />
              <Stat icon={<Cookie className="size-4" />} label="Accepted" value={consent.accepted} />
              <Stat icon={<Cookie className="size-4" />} label="Declined" value={consent.declined} />
            </div>
            <p className="text-soft-black-light mt-3 text-sm">{consentNoteText(consent)}</p>
          </>
        )}
      </Section>
```

Change the header sentence at line 53 so it covers only what it is true of: read it and scope it to the account figures (for example "Every account figure on this page comes from the database..."), since the new section counts browsers.

Blog admin page: under the heading of the views column or list, render `postHogCoverageCaption()` when it is not null, in the page's existing muted caption style.

- [ ] **Step 4: Run, type check, look**

Run: `npx vitest run src/lib/analytics/consent-launch.test.ts src/lib/admin && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/consent-launch.ts src/lib/analytics/consent-launch.test.ts "src/app/(admin)/admin/analytics/page.tsx" "src/app/(admin)/admin/blog/page.tsx"
git commit -m "Show the banner's accept rate and caption PostHog figures"
```

---

### Task 8: Blog videos load on click

**Files:** Create `src/components/blog/VideoEmbed.tsx`, `src/components/blog/VideoEmbed.test.tsx`. Modify `src/lib/blog/render.tsx:220-242`, and its test if one asserts the iframe (`grep -rln "embedUrl\|iframe" src/lib/blog/*.test.* src/components/blog/*.test.*`).

YouTube and Vimeo players set their own tracking cookies when they load. Until the reader asks for the video, nothing from either is fetched: no iframe, no thumbnail.

- [ ] **Step 1: Failing test**

```tsx
// src/components/blog/VideoEmbed.test.tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VideoEmbed } from "./VideoEmbed";

afterEach(cleanup);

describe("VideoEmbed", () => {
  it("fetches nothing from the provider until asked", () => {
    const { container } = render(
      <VideoEmbed provider="youtube" embedUrl="https://www.youtube.com/embed/abcdefghijk" />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Play YouTube video" })).toBeInTheDocument();
  });

  it("loads the player, playing, once the reader clicks", () => {
    const { container } = render(
      <VideoEmbed provider="vimeo" embedUrl="https://player.vimeo.com/video/123" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Vimeo video" }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://player.vimeo.com/video/123?autoplay=1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/blog/VideoEmbed.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/blog/VideoEmbed.tsx
"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { ParsedEmbed } from "@/lib/blog/embed";

/**
 * A provider video that loads only when the reader asks for it. YouTube and
 * Vimeo players set their own tracking cookies as soon as they load, so the
 * page shows a plain placeholder (no provider thumbnail, which would itself be
 * a request to the provider) until the click.
 */
export function VideoEmbed({ provider, embedUrl }: ParsedEmbed) {
  const [playing, setPlaying] = useState(false);
  const name = provider === "youtube" ? "YouTube" : "Vimeo";

  return (
    <div className="bg-soft-black relative my-6 aspect-video w-full overflow-hidden rounded-lg">
      {playing ? (
        <iframe
          src={`${embedUrl}?autoplay=1`}
          title={`${name} video`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${name} video`}
          className="font-body absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 text-white"
        >
          <span className="bg-teal flex size-16 items-center justify-center rounded-full">
            <Play className="size-7" aria-hidden="true" />
          </span>
          <span className="text-sm">
            Plays from {name}, which may set its own cookies.
          </span>
        </button>
      )}
    </div>
  );
}
```

In `render.tsx`, replace the `<div>...<iframe/></div>` returned for `"embed"` with `<VideoEmbed key={key} provider={parsed.provider} embedUrl={parsed.embedUrl} />`. Confirm `parseEmbed` never returns an `embedUrl` that already carries a query string (read `embed.ts:30-63`; it builds them from the id alone), so `?autoplay=1` is always the first parameter.

- [ ] **Step 4: Run, including the blog render tests**

Run: `npx vitest run src/components/blog src/lib/blog && npx tsc --noEmit` → PASS. Update any render test that asserted an iframe to assert the play button instead, keeping the assertion that an unrecognised URL renders nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/blog/VideoEmbed.tsx src/components/blog/VideoEmbed.test.tsx src/lib/blog/render.tsx
git add <the render test file, if changed>
git commit -m "Load blog videos only when the reader plays them"
```

---

### Task 9: Privacy policy

**Files:** Modify `src/app/(public)/privacy/page.tsx`, `src/lib/legal/last-updated.ts`. Create `src/app/(public)/privacy/privacy-consent-copy.test.ts`.

- [ ] **Step 1: Failing test** (whitespace collapsed, so a rewrap cannot break it, L278)

```ts
// src/app/(public)/privacy/privacy-consent-copy.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractProse } from "@/lib/legal/last-updated";

const prose = extractProse(readFileSync(path.join(__dirname, "page.tsx"), "utf8")).replace(/\s+/g, " ");

describe("the privacy policy says what the site does", () => {
  it("says browser analytics wait for Accept", () => {
    expect(prose).toMatch(/only after you accept/);
  });
  it("names Global Privacy Control", () => {
    expect(prose).toMatch(/Global Privacy Control/);
  });
  it("discloses the account events our server records whatever the banner says", () => {
    expect(prose).toMatch(/signing in, choosing your role, and payments/);
  });
  it("discloses error reports and performance timing for everyone", () => {
    expect(prose).toMatch(/error reports/);
  });
  it("discloses that videos load from YouTube or Vimeo only when played", () => {
    expect(prose).toMatch(/only when you press play/);
  });
  it("no longer asks visitors to email us to opt out", () => {
    expect(prose).not.toMatch(/would rather opt out, email/);
  });
  it("no longer says analytics run whenever the site is used", () => {
    expect(prose).not.toMatch(/When you use the site, we collect standard analytics data/);
  });
});
```

Read `extractProse`'s export first; if it is not exported, import it the way `last-updated.test.ts` does.

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Rewrite the analytics paragraphs**

Replace the paragraph starting "When you use the site, we collect standard analytics data" with:

```tsx
            <p className="mt-3">
              If you accept analytics in the banner shown on your first visit,
              we collect standard analytics data in your browser: pages
              visited, browser type, device type, approximate location
              (country or region level), and interaction events such as button
              clicks. We do not collect precise geolocation. Until you answer,
              and if you decline, none of this runs.
            </p>
```

Keep the "If you are signed in..." paragraph. In the "We also record sessions" paragraph, change its first sentence to begin "If you accept, we also record sessions:" and leave the rest. Replace the two paragraphs starting "Our analytics and session recording are provided by PostHog." and "You can also opt out by enabling" with:

```tsx
            <p className="mt-3">
              Analytics and session recording are provided by PostHog, and
              session replays for diagnosing errors by Sentry. Both run in your
              browser only after you accept them. You can change your answer at
              any time with Privacy choices at the bottom of every page; it is
              remembered in your browser for 12 months. If your browser sends
              Do Not Track or Global Privacy Control, we treat that as
              declining and do not ask.
            </p>
            <p className="mt-3">
              If you have an account, you can also turn analytics off under
              Privacy in your{" "}
              <Link href="/dashboard/settings" className="text-teal hover:underline">
                settings
              </Link>
              , which applies on every device you sign in on. Our servers record
              a few account events for every account whatever your browser
              answer is (signing in, choosing your role, and payments), so we
              can run the service and its billing; turning analytics off in
              settings stops those being sent to PostHog too.
            </p>
            <p className="mt-3">
              For every visitor, Sentry receives error reports when a page
              breaks (the page, the browser, and where in our code it failed)
              and timing for a sample of page loads, so we can keep the site
              working. These do not include what you type or see.
            </p>
```

Replace the Cookies paragraph with:

```tsx
            <p className="mt-3">
              NurseDex uses minimal cookies. If you accept analytics, PostHog
              sets a cookie to distinguish unique visitors; if you decline, we
              remove it. We do not use advertising cookies. Videos in blog posts
              load from YouTube or Vimeo only when you press play, and those
              services may then set their own cookies. Essential cookies (such
              as session tokens when you log in) are required for the site to
              function. Your banner answer is kept in your browser&apos;s
              storage, not in a cookie.
            </p>
```

- [ ] **Step 4: Move the date and hash**

Run: `npx vitest run src/lib/legal/last-updated.test.ts` → it FAILS naming the privacy page and the new hash. In `src/lib/legal/last-updated.ts`, set the privacy record's `date` to the day this ships and `proseSha` to the hash the failure printed.

- [ ] **Step 5: Run to verify both pass**

Run: `npx vitest run "src/app/(public)/privacy" src/lib/legal` → PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/privacy/page.tsx" "src/app/(public)/privacy/privacy-consent-copy.test.ts" src/lib/legal/last-updated.ts
git commit -m "Privacy policy: what runs before and after the banner"
```

---

### Task 10: Browser level proof

**Files:** Modify `playwright.config.ts`. Create `e2e/consent.spec.ts`, `e2e/helpers/consent-state.ts`.

- [ ] **Step 1: Seed every existing spec with an answer**

So the bar never sits over what an existing spec clicks:

```ts
// e2e/helpers/consent-state.ts
/** A recent Decline, so existing specs never meet the bar. consent.spec.ts opts out. */
export const CONSENT_ANSWERED = {
  cookies: [],
  origins: [
    {
      origin: "http://localhost:3000",
      localStorage: [
        { name: "nursedex_consent", value: JSON.stringify({ choice: "declined", at: Date.now() }) },
      ],
    },
  ],
};
```

In `playwright.config.ts`: import it; add `storageState: CONSENT_ANSWERED` to the `chromium` project's `use`, and to each `*-setup` project's `use` so the auth states they save already carry the answer. Add the webServer env (Playwright merges it over `process.env`, verified in `node_modules/playwright/lib/runner/index.js`):

```ts
    // The consent spec must see PostHog and Sentry TRY to run after Accept, or
    // "nothing before Accept" passes on a build where they never could. Both
    // are intercepted by the spec, so nothing leaves the machine.
    env: {
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_e2e_placeholder",
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://e2epublic@o0.ingest.sentry.io/0",
    },
```

- [ ] **Step 2: Write the spec**

```ts
// e2e/consent.spec.ts
import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

type Seen = { ingest: string[]; replays: number; errors: number };

/** Intercepts PostHog and Sentry so nothing leaves the machine, and records what was attempted. */
async function watch(page: Page): Promise<Seen> {
  const seen: Seen = { ingest: [], replays: 0, errors: 0 };
  await page.route("**/ingest/**", async (route) => {
    seen.ingest.push(route.request().url());
    await route.fulfill({ status: 200, body: "{}" });
  });
  await page.route("**/api/*/envelope/**", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes('"type":"replay_event"')) seen.replays += 1;
    if (body.includes('"type":"event"')) seen.errors += 1;
    await route.fulfill({ status: 200, body: "{}" });
  });
  return seen;
}

/** The banner marks the page once hydration knows the answer; asserting before that proves nothing. */
async function settled(page: Page, state: string) {
  await expect(page.locator(`html[data-consent-state="${state}"]`)).toBeAttached();
  await page.waitForLoadState("networkidle");
}

async function throwInPage(page: Page) {
  await page.evaluate(() => setTimeout(() => { throw new Error("consent e2e probe"); }));
}

const bar = (page: Page) => page.getByRole("region", { name: "Privacy choices" });

test("nothing runs before Accept, and it all starts after", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await settled(page, "none");
  await page.goto("/nurses");
  await settled(page, "none");

  // An error before consent: Sentry may report it, but no replay goes with it.
  await throwInPage(page);
  await expect.poll(() => seen.errors).toBeGreaterThan(0);
  expect(seen.replays).toBe(0);
  expect(seen.ingest).toEqual([]);
  expect(await phStorage(page)).toEqual([]);

  // Positive controls: without these, empty lists could mean neither could run.
  await bar(page).getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => seen.ingest.length).toBeGreaterThan(0);
  await throwInPage(page);
  await expect.poll(() => seen.replays).toBeGreaterThan(0);
});

test("withdrawing on a live page stops tracking for the rest of the visit", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await settled(page, "none");
  await bar(page).getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => seen.ingest.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Privacy choices" }).first().click();
  await bar(page).getByRole("button", { name: "Decline" }).click();
  await settled(page, "declined"); // after the reload
  const after = seen.ingest.length;

  await page.getByRole("link", { name: "Find a Nurse" }).first().click();
  await page.waitForURL("**/nurses");
  await page.waitForLoadState("networkidle");
  expect(seen.ingest.length).toBe(after);
  expect(await phStorage(page)).toEqual([]);
});

test("Decline keeps everything off across pages and reloads", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await settled(page, "none");
  await bar(page).getByRole("button", { name: "Decline" }).click();
  await page.reload();
  await settled(page, "declined");
  await page.goto("/pricing");
  await settled(page, "declined");
  await expect(bar(page)).toBeHidden();
  expect(seen.ingest).toEqual([]);
});

test("Global Privacy Control: no bar and nothing runs", async ({ page }) => {
  const seen = await watch(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
  });
  await page.goto("/");
  await settled(page, "signal");
  await expect(bar(page)).toBeHidden();
  expect(seen.ingest).toEqual([]);
});

test("a blog video fetches nothing from its provider until played", async ({ page }) => {
  const provider: string[] = [];
  page.on("request", (r) => {
    if (/youtube\.com|ytimg\.com|vimeo\.com|vimeocdn\.com/.test(r.url())) provider.push(r.url());
  });
  // A post with an embed: find one with
  //   grep -rln '"type":"embed"' supabase/seed* e2e/fixtures
  // or create one in the spec's setup the way e2e/blog.spec.ts creates posts.
  // If no fixture post carries an embed, add one there rather than skipping.
  await page.goto(BLOG_POST_WITH_VIDEO);
  await page.waitForLoadState("networkidle");
  expect(provider).toEqual([]);
  await page.getByRole("button", { name: /Play (YouTube|Vimeo) video/ }).click();
  await expect.poll(() => provider.length).toBeGreaterThan(0);
});

async function phStorage(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...Object.keys(window.localStorage).filter((k) => k.startsWith("ph_")),
    ...document.cookie.split(";").map((c) => c.trim().split("=")[0]).filter((k) => k.startsWith("ph_")),
  ]);
}
```

`BLOG_POST_WITH_VIDEO` must be resolved before this spec runs: read `e2e/blog.spec.ts` and the fixtures to find or create a post with an embed node, and define the constant at the top of the file. Do not leave the test skipped (L411).

- [ ] **Step 3: Run it**

Run: `npx playwright test e2e/consent.spec.ts --project=chromium`
Expected: PASS, 5 tests.

- [ ] **Step 4: See each negative fail**

One at a time, break the guard, run the named test, confirm it FAILS on the named assertion, then restore with `git checkout <file>`:

| Break | Test | Must fail on |
|---|---|---|
| Comment out `if (!analyticsAllowed()) return;` in `src/lib/posthog.ts` | nothing runs before Accept | `expect(seen.ingest).toEqual([])` |
| Change `if (analyticsAllowed()) startSentryReplay();` to `startSentryReplay();` | nothing runs before Accept | `expect(seen.replays).toBe(0)` |
| Make `withdrawPostHog` return `false` | withdrawing on a live page | `expect(seen.ingest.length).toBe(after)` |
| Remove the `if (nav.globalPrivacyControl === true) return true;` line | Global Privacy Control | `settled(page, "signal")` |
| Render the iframe immediately in `VideoEmbed` | a blog video | `expect(provider).toEqual([])` |

- [ ] **Step 5: Whole suites**

Run: `npm test` → PASS, executed count equals the `main` count recorded before Task 1 plus the tests this plan added (L288).
Run: `npx playwright test --project=chromium` → PASS, so seeding the answer broke no existing spec.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/consent.spec.ts e2e/helpers/consent-state.ts
git commit -m "Prove in a browser that nothing runs before Accept"
```

---

### Task 11: Look, apply, ship, verify, mark

- [ ] **Step 1: Look at it.** With `npm run dev` running, screenshot at 390px and 1440px, light and dark if the site has a dark theme: `/`, `/nurses`, a long blog post with a video (placeholder and playing), `/pricing`, `/dashboard` signed in (bar above the bottom nav, end of page reachable), a dialog opened with the bar up (dialog on top), the reopened bar showing "You declined on...", the GPC message, and the admin Analytics section in its ok, too few, empty and error states. Read every sentence cold (L21). Stop the dev server afterwards.

- [ ] **Step 2: Readiness check** on the touched files: the server action is unauthenticated by design and takes only three kinds; the admin readers sit behind `requireSuperAdmin`; every failure path has a test (tally write, tally read, storage refused, malformed value, silent tally).

- [ ] **Step 3: Open the PR.** Body: what runs before and after Accept, the e2e results including each deliberate failure, the screenshots, grants measured or not, the pushed back items above, and the known limits below.

- [ ] **Step 4: Migration before merge.** Write the migration plus these two statements to a scratch file and open it for Dan with `/Applications/BBEdit.app/Contents/Helpers/bbedit_tool --front-window <file>`; tell him focus is moving:

```sql
SELECT kind, count FROM public.consent_tally;  -- expect 0 rows and no error
INSERT INTO supabase_migrations.schema_migrations (version, name)
SELECT '071', 'consent_tally'
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '071');
```

Then `gh workflow run migration-drift.yml` is NOT a confirmation (it checks out `main`, which does not have 071 yet, #908); confirm instead by reading the table through the service role: `curl` the REST endpoint for `consent_tally?select=day&limit=1` with `Prefer: count=exact` and expect a 200.

- [ ] **Step 5: Merge and promote** once CI is green and 071 is confirmed (production goes through `promote.yml`; see memory `gh-account-and-ci-shape`).

- [ ] **Step 6: Verify live** in a fresh browser profile on production: the bar shows; no `/ingest` request, no `ph_` cookie, no YouTube or Vimeo request on a video post before Accept; `/ingest` requests after Accept; Privacy choices then Decline reloads and stops them. Then confirm a `shown` row exists for today.

- [ ] **Step 7: Mark the date.** Set `CONSENT_LAUNCH_DATE` to the production date, as this step's own commit and PR (with its test updated), and create a PostHog project annotation on that date: "Cookie banner live: from here PostHog counts only browsers that accepted". Confirm it shows on a pageview trend.

- [ ] **Step 8: File the known limits as issues** (L65), each with milestone, priority and category, through the normal gate.

## Known limits (filed in Step 8)

- The tally endpoint is unauthenticated: scripted calls can skew an admin only ratio. Crawlers that hide their user agent are counted.
- A browser that blocks storage is asked again on every page load, and is never tracked.
- The bar appears a moment after the page draws, because the answer is read after hydration.
- On a device that has never loaded a page rendering `PostHogIdentify`, an account with analytics off that accepts the banner can be counted anonymously on public pages until it reaches the dashboard or pricing page (the existing gap, narrowed: once seen, the setting is kept on the device).
- Server side account events are sent regardless of the banner, by decision; disclosed in the policy.
