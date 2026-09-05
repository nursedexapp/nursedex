// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  optOutShare,
  OPT_OUT_SHARE_THRESHOLD,
  isOptOutShareConcerning,
  optOutNoteText,
} from "./analytics-opt-out-share";

/**
 * #910. A person who has opted out of analytics is entirely absent from
 * PostHog while fully present in the database, which is the point of the
 * feature. Nothing counted them, so every funnel and acquisition number
 * silently excluded those people with no marker anywhere saying how many.
 *
 * Today the count is zero, so nothing is wrong. The failure arrives later and
 * looks like something else: as opt-outs grow, the funnel reads low and the
 * shape resembles people dropping out of a flow rather than people never
 * having been measured. This is L350's shape, where the sample shrinks as the
 * feature succeeds and a number calibrated on the old sample turns into noise
 * while still reading like a measurement.
 */
describe("what share of people are missing from the funnel", () => {
  it("is the opted out count over the population", () => {
    expect(optOutShare(5, 100)).toBeCloseTo(0.05);
  });

  it("is null rather than a number when there is nobody to divide by", () => {
    // Zero over zero is NaN, which renders as "NaN%" and compares false
    // against every threshold, so the warning would never fire and the screen
    // would carry a number that is not one (L50).
    expect(optOutShare(0, 0)).toBeNull();
    expect(optOutShare(3, 0)).toBeNull();
  });

  it("stays inside its own range", () => {
    // A share outside 0 to 1 is the only self-evident proof that the two
    // counts measure different populations, and nothing else would ever
    // report it (L588).
    for (const [part, whole] of [
      [0, 10],
      [10, 10],
      [3, 7],
    ] as const) {
      const share = optOutShare(part, whole);
      expect(share).not.toBeNull();
      expect(share as number).toBeGreaterThanOrEqual(0);
      expect(share as number).toBeLessThanOrEqual(1);
    }
  });

  it("refuses a count larger than the population it is a share of", () => {
    // Not clamped. Clamping would destroy the only evidence that the two
    // counts were read over different populations, and a quietly clamped
    // value is indistinguishable from a correct one (L340).
    expect(() => optOutShare(11, 10)).toThrow(/more people/i);
  });

  it("is not concerning while it is under the threshold", () => {
    expect(isOptOutShareConcerning(OPT_OUT_SHARE_THRESHOLD - 0.001)).toBe(
      false,
    );
    expect(isOptOutShareConcerning(OPT_OUT_SHARE_THRESHOLD)).toBe(false);
  });

  it("is concerning past it", () => {
    expect(isOptOutShareConcerning(OPT_OUT_SHARE_THRESHOLD + 0.001)).toBe(true);
  });

  it("is not concerning when there is no share to judge", () => {
    // Unknown is not the same as fine, but it is not a reason to warn about a
    // level nobody measured either. The panel says which it is.
    expect(isOptOutShareConcerning(null)).toBe(false);
  });
});

describe("what the page says about it", () => {
  it("says nobody is missing, rather than reporting a zero", () => {
    // "0 accounts opted out (0%)" reads as a measurement of nothing. The real
    // fact is that every signup on the page is also in PostHog, which is the
    // reassurance somebody comparing the two numbers actually needs.
    const text = optOutNoteText(0, 0);

    expect(text).toMatch(/no account has opted out/i);
    expect(text).toMatch(/also in PostHog/i);
    expect(text).not.toMatch(/0%/);
  });

  it("names the count and the share when there are some", () => {
    const text = optOutNoteText(3, 0.03);

    expect(text).toContain("3 of these accounts");
    expect(text).toContain("3%");
    expect(text).toMatch(/none of the PostHog funnels/i);
  });

  it("adds no warning while the share is under the threshold", () => {
    expect(optOutNoteText(3, 0.03)).not.toMatch(/fewer people measured/i);
  });

  it("says what a low funnel then means, once the share is over it", () => {
    // The number on its own is not a detector: it needs to say what to do
    // differently when reading the funnel, or it is a figure on a screen
    // (L357).
    const text = optOutNoteText(30, 0.3);

    expect(text).toMatch(
      /fewer people measured rather than fewer people converting/i,
    );
    expect(text).toContain("30%");
  });

  it("omits the share when there is none, rather than printing an empty one", () => {
    const text = optOutNoteText(2, null);

    expect(text).toContain("2 of these accounts");
    expect(text).not.toMatch(/\(\)/);
    expect(text).not.toMatch(/NaN/);
  });
});
