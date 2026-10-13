import { describe, it, expect } from "vitest";
import { postHogCoverageCaption } from "./consent-launch";

describe("postHogCoverageCaption", () => {
  it("names the launch date and who is counted after it", () => {
    expect(postHogCoverageCaption("2026-10-20")).toBe(
      "From 20 October 2026, PostHog counts only browsers that accepted the cookie banner.",
    );
  });
  it("names the day the banner went live in production", () => {
    // Promoted to nursedex.com at 7:15 PM New York time on 13 October 2026
    // (#1173), and verified live in a fresh browser the same evening.
    expect(postHogCoverageCaption()).toBe(
      "From 13 October 2026, PostHog counts only browsers that accepted the cookie banner.",
    );
  });
  it("says nothing before launch", () => {
    expect(postHogCoverageCaption(null)).toBeNull();
  });
});
