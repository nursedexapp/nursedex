import { z } from "zod";

export const REJECT_REASONS = [
  "License number not found",
  "License expired",
  "Name does not match license records",
  "License suspended or revoked",
  "Other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_DETAILS_MAX = 500;

export const verifyApproveSchema = z.object({
  user_id: z.string().uuid(),
});

export const verifyRejectSchema = z
  .object({
    user_id: z.string().uuid(),
    reason: z.enum(REJECT_REASONS),
    details: z
      .string()
      .trim()
      .max(
        REJECT_DETAILS_MAX,
        `Keep details under ${REJECT_DETAILS_MAX} characters`,
      )
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (
      data.reason === "Other" &&
      (!data.details || data.details.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["details"],
        message: "Please describe the issue when selecting Other",
      });
    }
  })
  .transform((data) => ({
    ...data,
    details: data.details && data.details.length > 0 ? data.details : null,
  }));

export type VerifyApproveInput = z.infer<typeof verifyApproveSchema>;
export type VerifyRejectInput = z.infer<typeof verifyRejectSchema>;
