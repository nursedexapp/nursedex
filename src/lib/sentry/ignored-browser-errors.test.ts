import { describe, it, expect } from "vitest";
import { eventFiltersIntegration, type Event } from "@sentry/core";
import { IGNORED_BROWSER_ERRORS } from "./ignored-browser-errors";

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
const filter = eventFiltersIntegration({ ignoreErrors: IGNORED_BROWSER_ERRORS });

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
