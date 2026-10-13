import { vi } from "vitest";
import posthog from "posthog-js";

const CONFIG = {
  api_host: "https://ph.example",
  capture_pageview: false,
  capture_pageleave: true,
  autocapture: true,
  disable_persistence: false,
  advanced_disable_flags: true,
  disable_session_recording: true,
  disable_surveys: true,
  // happy-dom's user agent reads as a bot, which PostHog drops anyway, and
  // that would make a control pass for the wrong reason.
  opt_out_useragent_filter: true,
} as const;

/**
 * Starts the REAL posthog-js in a happy-dom test with nothing reaching the
 * network: fetch, XMLHttpRequest and sendBeacon are all replaced, and only what
 * they were asked to send is recorded in `sent`. `captured` records every event
 * that got past before_send (posthog-js emits eventCaptured after it), which is
 * how a test sees an event that is still sitting in the batch queue.
 *
 * `teardown` puts the globals back and clears what PostHog wrote to this
 * browser, so the module's singleton never carries one file's state into
 * another test.
 */
export function startRealPostHog() {
  const sent: string[] = [];
  const captured: string[] = [];
  const realBeacon = Object.getOwnPropertyDescriptor(
    window.navigator,
    "sendBeacon",
  );

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      sent.push(`fetch:${String(url)}`);
      return new Response("{}", { status: 200 });
    }),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      open(_method: string, url: string) {
        sent.push(`xhr:${url}`);
      }
      setRequestHeader() {}
      send() {}
    },
  );
  Object.defineProperty(window.navigator, "sendBeacon", {
    value: (url: string) => {
      sent.push(`beacon:${url}`);
      return true;
    },
    configurable: true,
  });

  if (posthog.__loaded) {
    // The module's singleton outlives a test: put back whatever an earlier
    // test's withdrawal switched off, so every test starts from a running
    // PostHog. before_send goes back to null, not undefined, because
    // set_config skips undefined values.
    posthog.set_config({ ...CONFIG, before_send: null });
  } else {
    posthog.init("phc_test", CONFIG);
  }
  const unsubscribe = posthog.on("eventCaptured", (data) => {
    captured.push(String((data as { event?: unknown }).event));
  });

  function teardown() {
    unsubscribe();
    vi.unstubAllGlobals();
    if (realBeacon) {
      Object.defineProperty(window.navigator, "sendBeacon", realBeacon);
    } else {
      delete (window.navigator as { sendBeacon?: unknown }).sendBeacon;
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0]?.trim();
      if (name)
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }

  return { posthog, sent, captured, teardown };
}

/** Every PostHog identity key left in this browser's storage and cookies. */
export function postHogIdentityKeys(): string[] {
  const keys: string[] = [];
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith("ph_")) keys.push(key);
    }
  }
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name?.startsWith("ph_")) keys.push(`cookie:${name}`);
  }
  return keys;
}

/** A real button in the page, the kind PostHog's autocapture records. */
export function clickAButton(label = "Contact") {
  const button = document.createElement("button");
  button.textContent = label;
  document.body.appendChild(button);
  button.click();
  button.remove();
}
