import { describe, it, expect } from "vitest";
import { PRICING, TIER_LIMITS, RATE_LIMITS } from "./constants";

describe("constants", () => {
  it("has correct pricing", () => {
    expect(PRICING.NURSE_FEATURED_MONTHLY).toBe(29);
    expect(PRICING.FAMILY_ACCESS_MONTHLY).toBe(19.99);
  });

  it("free tier has stricter limits than featured", () => {
    expect(TIER_LIMITS.free.bioMaxLength).toBeLessThan(
      TIER_LIMITS.featured.bioMaxLength,
    );
    expect(TIER_LIMITS.free.maxPhotos).toBeLessThan(
      TIER_LIMITS.featured.maxPhotos,
    );
  });

  it("rate limits are reasonable", () => {
    expect(RATE_LIMITS.REVEALS_CAPTCHA_THRESHOLD).toBeLessThan(
      RATE_LIMITS.REVEALS_HARD_CAP,
    );
  });
});
