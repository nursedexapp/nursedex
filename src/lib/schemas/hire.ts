import { z } from "zod";

export const familyRecordHireSchema = z.object({
  nurse_user_id: z.string().uuid(),
});

export const claimHireByEmailSchema = z.object({
  family_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
});

export const confirmHireSchema = z.object({
  token: z.string().uuid(),
});

export type FamilyRecordHireInput = z.infer<typeof familyRecordHireSchema>;
export type ClaimHireByEmailInput = z.infer<typeof claimHireByEmailSchema>;
export type ConfirmHireInput = z.infer<typeof confirmHireSchema>;
