import { describe, it, expect } from "vitest";
import {
  familyRecordHireSchema,
  claimHireByEmailSchema,
  confirmHireSchema,
} from "@/lib/schemas/hire";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("familyRecordHireSchema", () => {
  it("accepts a valid v4 nurse_user_id", () => {
    expect(
      familyRecordHireSchema.safeParse({ nurse_user_id: VALID_UUID }).success,
    ).toBe(true);
  });

  it("rejects a non-UUID nurse_user_id", () => {
    expect(
      familyRecordHireSchema.safeParse({ nurse_user_id: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("claimHireByEmailSchema", () => {
  it("accepts a valid email and lowercases it", () => {
    const result = claimHireByEmailSchema.safeParse({
      family_email: "  Family@EXAMPLE.com  ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.family_email).toBe("family@example.com");
  });

  it("rejects an invalid email", () => {
    expect(
      claimHireByEmailSchema.safeParse({ family_email: "not-an-email" })
        .success,
    ).toBe(false);
  });
});

describe("confirmHireSchema", () => {
  it("accepts a valid v4 token", () => {
    expect(confirmHireSchema.safeParse({ token: VALID_UUID }).success).toBe(
      true,
    );
  });

  it("rejects a non-UUID token", () => {
    expect(confirmHireSchema.safeParse({ token: "abc" }).success).toBe(false);
  });
});
