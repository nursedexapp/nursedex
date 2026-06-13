import { describe, it, expect } from "vitest";
import { PRICING, TIER_LIMITS, RATE_LIMITS, SOCIAL_LINKS } from "./constants";

describe("constants", () => {
  it("has correct pricing", () => {
    expect(PRICING.NURSE_FEATURED_MONTHLY).toBe(29);
    expect(PRICING.FAMILY_ACCESS_MONTHLY).toBe(9.99);
    expect(PRICING.FAMILY_ACCESS_ANNUAL).toBe(99);
    expect(PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR).toBe(39.99);
  });

  it("annual first year beats twelve months and undercuts standard annual", () => {
    expect(PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR).toBeLessThan(
      PRICING.FAMILY_ACCESS_MONTHLY * 12,
    );
    expect(PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR).toBeLessThan(
      PRICING.FAMILY_ACCESS_ANNUAL,
    );
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

describe("SOCIAL_LINKS", () => {
  it("includes the official LinkedIn company profile", () => {
    expect(SOCIAL_LINKS.linkedin).toBe(
      "https://www.linkedin.com/company/nursedex/",
    );
  });

  it("lists the facebook, instagram, and linkedin profiles", () => {
    expect(Object.keys(SOCIAL_LINKS).sort()).toEqual([
      "facebook",
      "instagram",
      "linkedin",
    ]);
  });

  it("uses canonical https URLs with no tracking or fragment params", () => {
    for (const url of Object.values(SOCIAL_LINKS)) {
      const parsed = new URL(url);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.searchParams.has("utm_source")).toBe(false);
      expect(url).not.toContain("#");
    }
  });
});
