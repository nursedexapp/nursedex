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
  const remembered =
    memory.consent && withinTtl(memory.consent.at, now) ? memory.consent : null;
  if (!stored) return remembered;
  if (!remembered) return stored;
  // Both exist when a later write was refused by storage: the newest answer
  // wins, and on a tie the safer one (declined) does.
  if (remembered.at !== stored.at) return remembered.at > stored.at ? remembered : stored;
  return remembered.choice === "declined" ? remembered : stored.choice === "declined" ? stored : remembered;
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
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
