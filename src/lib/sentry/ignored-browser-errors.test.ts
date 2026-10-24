import { describe, it, expect } from "vitest";
import { eventFiltersIntegration, type Event } from "@sentry/core";
import {
  IGNORED_BROWSER_ERRORS,
  IGNORED_BROWSER_FRAME_URLS,
  dropNonBrowserRuntimeEvents,
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

/**
 * NURSEDEX-SITE-18, 2026-10-24. `TypeError: Cannot read properties of
 * undefined (reading 'getReader')`, one event, 0 users, from a client calling
 * itself Chrome 145 on Windows. It was not a browser. The bottom of its stack
 * is `ext:core/01_core.js eventLoopTick`, the event loop of the Deno runtime,
 * and every frame of ours is a nameless `<script>`, where a real browser's
 * reads `app:///_next/static/...` after Sentry relabels it. Something running
 * our page inside Deno answered a server action's fetch with a Response that
 * had no `body` property at all, which a browser's fetch never does (it is a
 * stream or null).
 *
 * Copied from Sentry event a2d04ddb6da841ffaae517e8af068381, frames oldest
 * first as the SDK sends them (L48).
 */
const site18: Event = {
  exception: {
    values: [
      {
        type: "TypeError",
        value: "Cannot read properties of undefined (reading 'getReader')",
        stacktrace: {
          frames: [
            {
              filename: "ext:core/01_core.js",
              function: "eventLoopTick",
              lineno: 178,
              colno: 7,
            },
            { filename: "ext:core/01_core.js", lineno: 294, colno: 9 },
            { filename: "<script>", lineno: 1, colno: 100633 },
            { filename: "<script>", function: "xm", lineno: 1, colno: 98865 },
            { filename: "<script>", lineno: 2, colno: 24698 },
            { filename: "<script>", function: "ep", lineno: 2, colno: 21450 },
          ],
        },
        mechanism: {
          type: "auto.browser.global_handlers.onunhandledrejection",
          handled: false,
        },
      },
    ],
  },
};

function withFrames(...filenames: string[]): Event {
  return {
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Cannot read properties of undefined (reading 'getReader')",
          stacktrace: { frames: filenames.map((filename) => ({ filename })) },
        },
      ],
    },
  };
}

describe("events from a page run inside Deno, not a browser (NURSEDEX-SITE-18)", () => {
  it("is not caught by the frame deny list, which reads only the throwing frame", () => {
    // Why this needs its own check: Sentry's denyUrls reads the LAST frame,
    // here a `<script>`, so the Deno frames below it are never consulted.
    const both = eventFiltersIntegration({
      ignoreErrors: IGNORED_BROWSER_ERRORS,
      denyUrls: IGNORED_BROWSER_FRAME_URLS,
    });

    expect(both.processEvent!(site18, {}, client)).not.toBeNull();
  });

  it("drops the recorded SITE-18 event", () => {
    expect(dropNonBrowserRuntimeEvents(site18)).toBeNull();
  });

  it("drops a Deno frame anywhere in the stack, not only at the bottom", () => {
    expect(
      dropNonBrowserRuntimeEvents(
        withFrames("<script>", "ext:deno_fetch/26_fetch.js", "<script>"),
      ),
    ).toBeNull();
  });

  it("drops a Deno frame in a chained cause, not only the first exception", () => {
    const chained: Event = {
      exception: {
        values: [
          ...withFrames("app:///_next/static/chunks/main-app-abc123.js")
            .exception!.values!,
          ...site18.exception!.values!,
        ],
      },
    };

    expect(dropNonBrowserRuntimeEvents(chained)).toBeNull();
  });

  it("keeps our own bundle as @sentry/nextjs relabels it", () => {
    const ours = withFrames(
      "app:///_next/static/chunks/main-app-abc123.js",
      "app:///_next/static/chunks/4bd1b696-def456.js",
    );

    expect(dropNonBrowserRuntimeEvents(ours)).toBe(ours);
  });

  it("keeps a stack of nameless scripts with no Deno frame", () => {
    // `<script>` alone is not proof of anything we can name, so it reports.
    const anonymous = withFrames("<script>", "<script>");

    expect(dropNonBrowserRuntimeEvents(anonymous)).toBe(anonymous);
  });

  it("keeps a file of ours whose name merely contains ext:", () => {
    const lookalike = withFrames("app:///_next/static/chunks/text:core.js");

    expect(dropNonBrowserRuntimeEvents(lookalike)).toBe(lookalike);
  });

  it("keeps an event with no stack, and one with no exception", () => {
    const noStack = withFrames();
    const message: Event = {
      message: "CSP violation: script-src blocked eval",
    };

    expect(dropNonBrowserRuntimeEvents(noStack)).toBe(noStack);
    expect(dropNonBrowserRuntimeEvents(message)).toBe(message);
  });
});
