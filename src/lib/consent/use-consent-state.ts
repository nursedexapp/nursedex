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
