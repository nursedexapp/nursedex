import { z } from "zod";

export const REVIEW_TEXT_MIN = 25;
export const REVIEW_TEXT_MAX = 2000;
export const REMOVAL_REASON_MAX = 200;
export const NURSE_RESPONSE_MAX = 500;

/**
 * Family-side platform review submission.
 *
 * - Text is optional. If provided, it must be at least 25 characters so we
 *   reject one-word "great!" submissions.
 * - testimonial_opt_in is only meaningful when the rating is 4 or 5. We
 *   coerce it to false for lower ratings instead of rejecting, so the UI
 *   can still leave the checkbox state in the form.
 */
export const familyReviewSchema = z
  .object({
    nurse_user_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    reviewer_name: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(50, "Keep first name under 50 characters"),
    text: z
      .string()
      .trim()
      .max(REVIEW_TEXT_MAX, `Keep your review under ${REVIEW_TEXT_MAX} characters`)
      .optional()
      .or(z.literal("")),
    testimonial_opt_in: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.text && data.text.length > 0 && data.text.length < REVIEW_TEXT_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: `Add at least ${REVIEW_TEXT_MIN} characters or leave it blank`,
      });
    }
  })
  .transform((data) => ({
    ...data,
    text: data.text && data.text.length > 0 ? data.text : null,
    testimonial_opt_in: data.rating >= 4 ? data.testimonial_opt_in : false,
  }));

export type FamilyReviewInput = z.infer<typeof familyReviewSchema>;

export const removalRequestSchema = z.object({
  review_id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Please tell us why")
    .max(
      REMOVAL_REASON_MAX,
      `Keep your reason under ${REMOVAL_REASON_MAX} characters`,
    ),
});

export type RemovalRequestInput = z.infer<typeof removalRequestSchema>;

/**
 * External (anonymous) review submission. Mirrors familyReviewSchema but
 * adds an email and skips the requirement for an authenticated user.
 */
export const externalReviewSchema = z
  .object({
    link_token: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    reviewer_name: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(50, "Keep first name under 50 characters"),
    reviewer_email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email"),
    text: z
      .string()
      .trim()
      .max(REVIEW_TEXT_MAX, `Keep your review under ${REVIEW_TEXT_MAX} characters`)
      .optional()
      .or(z.literal("")),
    testimonial_opt_in: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.text && data.text.length > 0 && data.text.length < REVIEW_TEXT_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: `Add at least ${REVIEW_TEXT_MIN} characters or leave it blank`,
      });
    }
  })
  .transform((data) => ({
    ...data,
    text: data.text && data.text.length > 0 ? data.text : null,
    testimonial_opt_in: data.rating >= 4 ? data.testimonial_opt_in : false,
  }));

export type ExternalReviewInput = z.infer<typeof externalReviewSchema>;

export const nurseResponseSchema = z.object({
  review_id: z.string().uuid(),
  text: z
    .string()
    .trim()
    .min(1, "Write something before saving")
    .max(
      NURSE_RESPONSE_MAX,
      `Keep your response under ${NURSE_RESPONSE_MAX} characters`,
    ),
});

export type NurseResponseInput = z.infer<typeof nurseResponseSchema>;

export const DISPUTE_REASONS = [
  "Factually inaccurate",
  "Not a real client",
  "Personal attack or harassment",
  "Defamatory",
  "Other",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_TEXT_MAX = 500;

export const disputeReviewSchema = z
  .object({
    review_id: z.string().uuid(),
    reason: z.enum(DISPUTE_REASONS),
    text: z
      .string()
      .trim()
      .max(
        DISPUTE_TEXT_MAX,
        `Keep your explanation under ${DISPUTE_TEXT_MAX} characters`,
      )
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // "Other" requires a free-text explanation; the canned reasons
    // don't, but anything provided still has to fit the cap.
    if (data.reason === "Other" && (!data.text || data.text.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "Please describe the issue when selecting Other",
      });
    }
  })
  .transform((data) => ({
    ...data,
    text: data.text && data.text.length > 0 ? data.text : null,
  }));

export type DisputeReviewInput = z.infer<typeof disputeReviewSchema>;
