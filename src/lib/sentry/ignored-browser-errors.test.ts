import { describe, it, expect } from "vitest";
import { eventFiltersIntegration, type Event } from "@sentry/core";
import {
  IGNORED_BROWSER_ERRORS,
  IGNORED_BROWSER_FRAME_URLS,
} from "./ignored-browser-errors";

/**
 * Drives Sentry's OWN filter with the list we actually ship, rather than
 * asserting that a string appears in the config file (#1071). A source-text
 * assertion is satisfied by a comment mentioning the error, and says nothing
 * about whether the event is really discarded.
 *
 * The client is the one stand-in, and it exists only so the integration can
 * read the (empty) top-level Sentry options. Every decision below is made by
 * Sentry's own predicate.
 */
const client = { getOptions: () => ({}) } as never;
const filter = eventFiltersIntegration({
  ignoreErrors: IGNORED_BROWSER_ERRORS,
});

function isDropped(type: string, value: string): boolean {
  const event: Event = { exception: { values: [{ type, value }] } };
  return filter.processEvent!(event, {}, client) === null;
}

describe("in-app browser error filtering (#1071)", () => {
  it("drops the Facebook iOS bridge error (NURSEDEX-SITE-Y)", () => {
    expect(
      isDropped(
        "TypeError",
        "undefined is not an object (evaluating 'window.webkit.messageHandlers[t].postMessage')",
      ),
    ).toBe(true);
  });

  it("drops the same error when the host app renames its minified variable", () => {
    expect(
      isDropped(
        "TypeError",
        "undefined is not an object (evaluating 'window.webkit.messageHandlers[Rn].postMessage')",
      ),
    ).toBe(true);
  });

  it("drops the Instagram Android bridge error (NURSEDEX-SITE-5)", () => {
    expect(
      isDropped("Error", "Error invoking postMessage: Java object is gone"),
    ).toBe(true);
  });

  it("keeps our own TypeError that opens with the same words", () => {
    expect(
      isDropped(
        "TypeError",
        "undefined is not an object (evaluating 'nurse.profile.photo_url')",
      ),
    ).toBe(false);
  });

  it("keeps our own error that mentions postMessage", () => {
    expect(
      isDropped("Error", "postMessage failed to reach the reveal iframe"),
    ).toBe(false);
  });

  it("keeps a plain error our own code throws", () => {
    expect(isDropped("Error", "Missing SENTRY_AUTH_TOKEN")).toBe(false);
  });
});

/**
 * NURSEDEX-SITE-12. A Samsung Galaxy A14 opened nursedex.com inside the
 * Facebook app on 2026-09-21 and Sentry filed `SyntaxError: Unexpected end of
 * input` as ours, unhandled, 0 users impacted, with a session replay attached.
 *
 * The whole stack was one frame: `app://iab_inner_frame_ota:38:42`. "iab" is
 * Facebook's in-app browser, and `app://` is the scheme it serves its own
 * injected frame from. Nothing we ship is served from `app://`: our bundle,
 * Cloudflare Turnstile and PostHog are all https.
 *
 * IGNORED_BROWSER_ERRORS cannot express this one. That list keys on the
 * message, and this message is one our own code could legitimately produce
 * (a JSON.parse of a truncated response says exactly this), so matching on it
 * would throw away real crashes. The only thing that separates them is where
 * the throwing frame was loaded from, which is what `denyUrls` reads.
 */
const denyFilter = eventFiltersIntegration({
  denyUrls: IGNORED_BROWSER_FRAME_URLS,
});

function isDroppedByFrame(value: string, filename: string): boolean {
  const event: Event = {
    exception: {
      values: [
        {
          type: "SyntaxError",
          value,
          stacktrace: { frames: [{ filename, lineno: 38, colno: 42 }] },
        },
      ],
    },
  };
  return denyFilter.processEvent!(event, {}, client) === null;
}

describe("in-app browser injected frames (NURSEDEX-SITE-12)", () => {
  it("drops the Facebook in-app browser frame that filed SITE-12", () => {
    expect(
      isDroppedByFrame("Unexpected end of input", "app://iab_inner_frame_ota"),
    ).toBe(true);
  });

  it("drops it when the host app renames the injected frame", () => {
    expect(
      isDroppedByFrame("Unexpected end of input", "app://iab_outer_frame"),
    ).toBe(true);
  });

  it("keeps the very same message when it is thrown by our own bundle", () => {
    // The negative control the message-based list could never pass: this is
    // what a JSON.parse of a truncated response looks like, and it is a real
    // crash we must still hear about.
    expect(
      isDroppedByFrame(
        "Unexpected end of input",
        "https://nursedex.com/_next/static/chunks/main-abc123.js",
      ),
    ).toBe(false);
  });

  it("keeps our own bundle after @sentry/nextjs relabels it app:///_next", () => {
    // The control this filter nearly shipped without. @sentry/nextjs installs
    // nextjsClientStackFrameNormalizationIntegration by default, which turns
    // `<origin>/<path>/_next/static/...` into `app:///_next/static/...`, so
    // OUR OWN frames wear an app:// scheme too. A pattern of plain `^app://`
    // matches those as readily as the in-app browser's, and would discard
    // every client side crash we have while looking like it was working.
    expect(
      isDroppedByFrame(
        "Unexpected end of input",
        "app:///_next/static/chunks/main-app-abc123.js",
      ),
    ).toBe(false);
  });

  it("keeps an error thrown by a third party script we deliberately load", () => {
    expect(
      isDroppedByFrame(
        "Unexpected end of input",
        "https://challenges.cloudflare.com/turnstile/v0/api.js",
      ),
    ).toBe(false);
  });
});

describe("the recorded SITE-12 event, verbatim", () => {
  /**
   * Copied from Sentry event 95c8ecd87dd345f0a1bd10264fcee8c8 rather than
   * written by hand, so what the filter is asked about is the thing that
   * actually arrived (L48), including the mechanism, which is one of the
   * fields Sentry's own url extraction reads.
   */
  const recorded: Event = {
    exception: {
      values: [
        {
          type: "SyntaxError",
          value: "Unexpected end of input",
          stacktrace: {
            frames: [
              { filename: "app://iab_inner_frame_ota", lineno: 38, colno: 42 },
            ],
          },
          mechanism: {
            type: "auto.browser.global_handlers.onerror",
            handled: false,
          },
        },
      ],
    },
  };

  it("is discarded by the deny list we ship", () => {
    expect(denyFilter.processEvent!(recorded, {}, client)).toBeNull();
  });

  it("survives the same filter with an empty deny list", () => {
    // Names which check fired (L154). eventFiltersIntegration also drops
    // "useless" errors on its own, and this event is one exception with no
    // message, so without this control a pass says only that SOMETHING in
    // Sentry discarded it, not that IGNORED_BROWSER_FRAME_URLS did.
    const noDenyList = eventFiltersIntegration({ denyUrls: [] });

    expect(noDenyList.processEvent!(recorded, {}, client)).not.toBeNull();
  });
});
