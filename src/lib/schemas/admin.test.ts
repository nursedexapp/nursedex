import { describe, it, expect } from "vitest";
import { REJECT_REASONS, verifyRejectSchema } from "./admin";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("admin reject reasons", () => {
  it("are credential-neutral (HHAs hold no license, so no license-specific wording)", () => {
    for (const reason of REJECT_REASONS) {
      expect(reason.toLowerCase()).not.toContain("license");
    }
  });

  it("accepts a known reason", () => {
    const res = verifyRejectSchema.safeParse({
      user_id: UUID,
      reason: REJECT_REASONS[0],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a retired license-specific reason", () => {
    const res = verifyRejectSchema.safeParse({
      user_id: UUID,
      reason: "License number not found",
    });
    expect(res.success).toBe(false);
  });

  it("requires details when the reason is Other", () => {
    const res = verifyRejectSchema.safeParse({
      user_id: UUID,
      reason: "Other",
    });
    expect(res.success).toBe(false);
  });
});
