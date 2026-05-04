import { describe, it, expect } from "vitest";
import {
  familyReviewSchema,
  externalReviewSchema,
  removalRequestSchema,
  nurseResponseSchema,
  disputeReviewSchema,
  REVIEW_TEXT_MIN,
  REVIEW_TEXT_MAX,
  NURSE_RESPONSE_MAX,
  DISPUTE_TEXT_MAX,
} from "@/lib/schemas/review";

// Valid RFC v4 UUID, Zod 4's .uuid() enforces variant bits.
const NURSE_ID = "11111111-1111-4111-8111-111111111111";
const REVIEW_ID = "22222222-2222-4222-8222-222222222222";

describe("familyReviewSchema", () => {
  it("accepts a minimal review with no text", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "Sam",
      testimonial_opt_in: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.text).toBeNull();
    expect(result.data?.testimonial_opt_in).toBe(true);
  });

  it("rejects ratings outside 1..5", () => {
    expect(
      familyReviewSchema.safeParse({
        nurse_user_id: NURSE_ID,
        rating: 0,
        reviewer_name: "Sam",
      }).success,
    ).toBe(false);

    expect(
      familyReviewSchema.safeParse({
        nurse_user_id: NURSE_ID,
        rating: 6,
        reviewer_name: "Sam",
      }).success,
    ).toBe(false);
  });

  it("rejects review text shorter than the minimum when not blank", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 4,
      reviewer_name: "Sam",
      text: "a".repeat(REVIEW_TEXT_MIN - 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts review text right at the minimum", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 4,
      reviewer_name: "Sam",
      text: "a".repeat(REVIEW_TEXT_MIN),
    });
    expect(result.success).toBe(true);
    expect(result.data?.text?.length).toBe(REVIEW_TEXT_MIN);
  });

  it("rejects text longer than the maximum", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "Sam",
      text: "a".repeat(REVIEW_TEXT_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("forces testimonial_opt_in to false on 1-3 star reviews", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 2,
      reviewer_name: "Sam",
      testimonial_opt_in: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.testimonial_opt_in).toBe(false);
  });

  it("preserves testimonial_opt_in on 4+ star reviews", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "Sam",
      testimonial_opt_in: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.testimonial_opt_in).toBe(true);
  });

  it("requires a non-empty first name", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: NURSE_ID,
      rating: 5,
      reviewer_name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid nurse_user_id", () => {
    const result = familyReviewSchema.safeParse({
      nurse_user_id: "not-a-uuid",
      rating: 5,
      reviewer_name: "Sam",
    });
    expect(result.success).toBe(false);
  });
});

describe("externalReviewSchema", () => {
  const baseInput = {
    link_token: NURSE_ID,
    rating: 5,
    reviewer_name: "Pat",
    reviewer_email: "pat@example.com",
  };

  it("accepts a minimal external review", () => {
    const result = externalReviewSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    expect(result.data?.text).toBeNull();
  });

  it("rejects an invalid email", () => {
    expect(
      externalReviewSchema.safeParse({
        ...baseInput,
        reviewer_email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("normalizes email casing", () => {
    const result = externalReviewSchema.safeParse({
      ...baseInput,
      reviewer_email: "  PAT@Example.COM  ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.reviewer_email).toBe("pat@example.com");
  });

  it("forces testimonial_opt_in to false on 1-3 star reviews", () => {
    const result = externalReviewSchema.safeParse({
      ...baseInput,
      rating: 3,
      testimonial_opt_in: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.testimonial_opt_in).toBe(false);
  });

  it("rejects review text shorter than the minimum", () => {
    expect(
      externalReviewSchema.safeParse({
        ...baseInput,
        text: "a".repeat(REVIEW_TEXT_MIN - 1),
      }).success,
    ).toBe(false);
  });
});

describe("nurseResponseSchema", () => {
  it("accepts a normal response", () => {
    expect(
      nurseResponseSchema.safeParse({
        review_id: REVIEW_ID,
        text: "Thank you so much for the kind words.",
      }).success,
    ).toBe(true);
  });

  it("rejects empty text", () => {
    expect(
      nurseResponseSchema.safeParse({ review_id: REVIEW_ID, text: "  " })
        .success,
    ).toBe(false);
  });

  it(`rejects text over ${NURSE_RESPONSE_MAX} characters`, () => {
    expect(
      nurseResponseSchema.safeParse({
        review_id: REVIEW_ID,
        text: "a".repeat(NURSE_RESPONSE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("disputeReviewSchema", () => {
  it("accepts a canned reason without explanation", () => {
    expect(
      disputeReviewSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "Factually inaccurate",
      }).success,
    ).toBe(true);
  });

  it("requires a free-text explanation when reason is Other", () => {
    expect(
      disputeReviewSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "Other",
      }).success,
    ).toBe(false);

    expect(
      disputeReviewSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "Other",
        text: "This review references the wrong nurse.",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown reason", () => {
    expect(
      disputeReviewSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "Just because",
      }).success,
    ).toBe(false);
  });

  it(`rejects text over ${DISPUTE_TEXT_MAX} characters`, () => {
    expect(
      disputeReviewSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "Defamatory",
        text: "a".repeat(DISPUTE_TEXT_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("transforms empty string text to null", () => {
    const result = disputeReviewSchema.safeParse({
      review_id: REVIEW_ID,
      reason: "Personal attack or harassment",
      text: "",
    });
    expect(result.success).toBe(true);
    expect(result.data?.text).toBeNull();
  });
});

describe("removalRequestSchema", () => {
  it("accepts a normal reason", () => {
    expect(
      removalRequestSchema.safeParse({
        review_id: REVIEW_ID,
        reason: "It contains personal info I want removed.",
      }).success,
    ).toBe(true);
  });

  it("rejects empty reason", () => {
    expect(
      removalRequestSchema.safeParse({ review_id: REVIEW_ID, reason: "  " })
        .success,
    ).toBe(false);
  });

  it("rejects oversized reason", () => {
    expect(
      removalRequestSchema.safeParse({
        review_id: NURSE_ID,
        reason: "a".repeat(201),
      }).success,
    ).toBe(false);
  });
});
