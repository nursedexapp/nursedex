import { describe, it, expect } from "vitest";
import {
  shouldShowFeaturedUpsell,
  UPSELL_COOLDOWN_DAYS,
} from "@/lib/profile/upsell";
import { NurseTier, VerificationStatus } from "@/types/enums";

const NOW = new Date("2026-05-03T12:00:00Z");

const baseGate = {
  tier: NurseTier.FREE,
  verification_status: VerificationStatus.VERIFIED,
  save_count_for_upsell: 1,
  last_upsell_shown_at: null,
};

describe("shouldShowFeaturedUpsell", () => {
  it("returns true when threshold met and no prior toast shown", () => {
    expect(shouldShowFeaturedUpsell(baseGate, NOW)).toBe(true);
  });

  it("returns false for nurses already on the featured tier", () => {
    expect(
      shouldShowFeaturedUpsell({ ...baseGate, tier: NurseTier.FEATURED }, NOW),
    ).toBe(false);
  });

  it("returns false when verification was rejected (bad timing)", () => {
    expect(
      shouldShowFeaturedUpsell(
        { ...baseGate, verification_status: VerificationStatus.REJECTED },
        NOW,
      ),
    ).toBe(false);
  });

  it("returns false when save count is below threshold", () => {
    expect(
      shouldShowFeaturedUpsell({ ...baseGate, save_count_for_upsell: 0 }, NOW),
    ).toBe(false);
  });

  it("returns false within the cooldown window", () => {
    const recently = new Date(NOW);
    recently.setDate(recently.getDate() - (UPSELL_COOLDOWN_DAYS - 1));
    expect(
      shouldShowFeaturedUpsell(
        { ...baseGate, last_upsell_shown_at: recently.toISOString() },
        NOW,
      ),
    ).toBe(false);
  });

  it("returns true once the cooldown has fully elapsed", () => {
    const longAgo = new Date(NOW);
    longAgo.setDate(longAgo.getDate() - (UPSELL_COOLDOWN_DAYS + 1));
    expect(
      shouldShowFeaturedUpsell(
        { ...baseGate, last_upsell_shown_at: longAgo.toISOString() },
        NOW,
      ),
    ).toBe(true);
  });

  it("respects pending verification (still upsells)", () => {
    expect(
      shouldShowFeaturedUpsell(
        { ...baseGate, verification_status: VerificationStatus.PENDING },
        NOW,
      ),
    ).toBe(true);
  });
});
