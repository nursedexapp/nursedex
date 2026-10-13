// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from "vitest";
import posthog from "posthog-js";
import { withdrawPostHog } from "./posthog";

/**
 * Against the real posthog-js, not a mock: what withdrawPostHog has to stop
 * is the library's own unload handler, which captures $pageleave and sends it
 * by beacon (posthog-core.js _handle_unload), and Decline reloads the page,
 * so without this every withdrawal ends with one more event.
 *
 * Nothing reaches the network: fetch, XMLHttpRequest and sendBeacon are all
 * replaced, and only what they were asked to send is recorded.
 */
const sent: string[] = [];

beforeAll(() => {
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
  posthog.init("phc_test", {
    api_host: "https://ph.example",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    advanced_disable_flags: true,
    disable_session_recording: true,
    disable_surveys: true,
    // happy-dom's user agent reads as a bot, which PostHog drops anyway, and
    // that would make the control below pass for the wrong reason.
    opt_out_useragent_filter: true,
  });
});

const leave = () => window.dispatchEvent(new Event("pagehide"));

describe("withdrawPostHog on the real library", () => {
  it("sends nothing more from the page, the unload pageleave included, and never opts out", () => {
    // Control: before withdrawal, leaving the page sends the pageleave.
    leave();
    expect(sent.some((s) => s.startsWith("beacon:"))).toBe(true);

    sent.length = 0;
    expect(withdrawPostHog()).toBe(true);
    posthog.capture("after_withdrawal");
    document.body.click();
    leave();
    expect(sent).toEqual([]);
    // PostHog's own opt-out record may carry the ACCOUNT's choice: untouched.
    expect(posthog.has_opted_out_capturing()).toBe(false);
  });
});
