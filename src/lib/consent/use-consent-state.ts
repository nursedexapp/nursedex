"use client";

import { useSyncExternalStore } from "react";
import {
  ACCOUNT_OFF_KEY,
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  analyticsAllowed,
  currentConsentSnapshot,
  type ConsentSnapshot,
} from "./store";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === ACCOUNT_OFF_KEY)
      onChange();
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
  return useSyncExternalStore(
    subscribe,
    () => currentConsentSnapshot(),
    () => "unknown" as const,
  );
}

/**
 * Whether tracking may run in this browser right now: the whole predicate,
 * so it changes when the account setting changes as well as the banner
 * answer, in this tab or another. useConsentState alone cannot carry that: an
 * account switched off leaves the answer "accepted", so nothing keyed on it
 * re-runs. "unknown" on the server and during hydration, as above.
 */
export function useTrackingState(): "unknown" | "allowed" | "refused" {
  return useSyncExternalStore(
    subscribe,
    () => (analyticsAllowed() ? "allowed" : "refused"),
    () => "unknown" as const,
  );
}
