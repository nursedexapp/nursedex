import { z } from "zod";
import {
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
  CommunicationPreference,
} from "@/types/enums";
import { TIER_LIMITS } from "@/lib/constants";
import type { NurseTier } from "@/types/enums";
import { validatePhone } from "@/lib/utils/phone";

// ── Step 1: Basics ──────────────────────────────────────────

export const step1Schema = z.object({
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be under 50 characters"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be under 50 characters"),
  gender: z.nativeEnum(Gender, "Please select your gender"),
  years_experience: z
    .number("Years of experience is required")
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(70, "Must be 70 or fewer"),
  languages: z
    .array(z.string().min(1))
    .min(1, "At least one language is required"),
});

export type Step1Data = z.infer<typeof step1Schema>;

// ── Step 2: Credentials ─────────────────────────────────────

export function step2Schema(tier: NurseTier) {
  const maxCareTypes = TIER_LIMITS[tier].maxCareTypes;

  return z
    .object({
      credential: z.nativeEnum(Credential, "Credential type is required"),
      license_number: z
        .string()
        .max(30, "License or certification number is too long"),
      care_types: z
        .array(z.nativeEnum(CareType))
        .min(1, "Select at least one care type")
        .max(
          maxCareTypes === Infinity ? 100 : maxCareTypes,
          `Free plan allows up to ${maxCareTypes} care types`,
        ),
      primary_care_type: z.nativeEnum(CareType).nullable(),
    })
    .refine(
      (data) => {
        if (data.care_types.length <= 1) return true;
        return data.primary_care_type !== null;
      },
      {
        message: "Select a primary care type when you have multiple",
        path: ["primary_care_type"],
      },
    )
    .refine((data) => isLicenseNumberValid(data), {
      message: "License or certification number is required",
      path: ["license_number"],
    });
}

// HHAs don't carry a license or certification number, so the field is
// optional for them and required for every other credential.
function isLicenseNumberValid(data: {
  credential: Credential;
  license_number: string;
}): boolean {
  return (
    data.credential === Credential.HHA || data.license_number.trim().length > 0
  );
}

export type Step2Data = z.infer<ReturnType<typeof step2Schema>>;

// ── Step 3: Skills & Details ────────────────────────────────

export const step3Schema = z
  .object({
    skills: z.array(z.nativeEnum(Skill)).default([]),
    availability_commitment: z
      .array(z.nativeEnum(AvailabilityCommitment))
      .default([]),
    time_slots: z.array(z.nativeEnum(TimeSlot)).default([]),
    rate_min: z.number().min(0, "Rate cannot be negative").nullable(),
    rate_max: z.number().min(0, "Rate cannot be negative").nullable(),
    has_transportation: z.boolean().default(false),
    covid_vaccinated: z.boolean().nullable().default(null),
    care_philosophy: z
      .string()
      .max(500, "Care philosophy must be under 500 characters")
      .nullable()
      .default(null),
    additional_certs: z.array(z.string().min(1)).default([]),
  })
  .refine(
    (data) => {
      if (data.rate_min !== null && data.rate_max !== null) {
        return data.rate_max >= data.rate_min;
      }
      return true;
    },
    {
      message: "Maximum rate must be equal to or greater than minimum rate",
      path: ["rate_max"],
    },
  );

export type Step3Data = z.infer<typeof step3Schema>;

// ── Step 4: Bio & Photos ────────────────────────────────────

// Phrases lifted from the bio placeholder. If a nurse's bio contains
// any of these, they almost certainly copied the example and tweaked
// a word or two. Both phrases are distinctive enough that they
// wouldn't appear in a genuine bio without copy-pasting.
const BIO_PLACEHOLDER_PHRASES = [
  "i have been a dedicated healthcare professional",
  "i treat every patient like family",
];

export function isBioFromPlaceholder(bio: string): boolean {
  const normalized = bio.toLowerCase();
  return BIO_PLACEHOLDER_PHRASES.some((phrase) => normalized.includes(phrase));
}

export const BIO_PLACEHOLDER_ERROR =
  "This looks like our example bio. Please write something in your own words so families get to know the real you.";

export function step4Schema(tier: NurseTier) {
  const limits = TIER_LIMITS[tier];

  return z.object({
    bio: z
      .string()
      .min(1, "A bio is required")
      .max(
        limits.bioMaxLength,
        `Bio must be under ${limits.bioMaxLength} characters`,
      )
      .refine((bio) => !isBioFromPlaceholder(bio), BIO_PLACEHOLDER_ERROR),
    photos: z
      .array(z.string())
      .min(1, "Please upload at least one photo")
      .max(
        limits.maxPhotos,
        `Your plan allows up to ${limits.maxPhotos} photo${limits.maxPhotos === 1 ? "" : "s"}`,
      ),
  });
}

export type Step4Data = z.infer<ReturnType<typeof step4Schema>>;

// ── Step 5: Contact Info ────────────────────────────────────

export const step5Schema = z
  .object({
    contact_email: z
      .string()
      .email("Please enter a valid email")
      .or(z.literal(""))
      .nullable()
      .default(null),
    contact_phone: z
      .string()
      .or(z.literal(""))
      .nullable()
      .default(null)
      .superRefine((val, ctx) => {
        const err = validatePhone(val);
        if (err)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err,
          });
      }),
    communication_preference: z.nativeEnum(
      CommunicationPreference,
      "Select a preferred communication method",
    ),
    zip_code: z
      .string()
      .regex(/^\d{5}$/, "Please enter a valid 5-digit zip code"),
    travel_radius_miles: z
      .number()
      .int()
      .min(1, "Travel radius must be at least 1 mile")
      .max(100, "Travel radius cannot exceed 100 miles"),
  })
  .refine(
    (data) => {
      const hasEmail = data.contact_email && data.contact_email.length > 0;
      const hasPhone = data.contact_phone && data.contact_phone.length > 0;
      return hasEmail || hasPhone;
    },
    {
      message: "Please provide at least an email or phone number",
      path: ["contact_email"],
    },
  );

export type Step5Data = z.infer<typeof step5Schema>;

// ── Full profile schema (tier-aware, for edit page) ─────────

export function fullProfileSchema(tier: NurseTier) {
  const limits = TIER_LIMITS[tier];

  return z
    .object({
      // Step 1
      first_name: z.string().min(1).max(50),
      last_name: z.string().min(1).max(50),
      gender: z.nativeEnum(Gender),
      years_experience: z.number().int().min(0).max(70),
      languages: z.array(z.string().min(1)).min(1),
      // Step 2
      credential: z.nativeEnum(Credential),
      license_number: z.string().max(30),
      care_types: z
        .array(z.nativeEnum(CareType))
        .min(1)
        .max(limits.maxCareTypes === Infinity ? 100 : limits.maxCareTypes),
      primary_care_type: z.nativeEnum(CareType).nullable(),
      // Step 3
      skills: z.array(z.nativeEnum(Skill)).default([]),
      availability_commitment: z
        .array(z.nativeEnum(AvailabilityCommitment))
        .default([]),
      time_slots: z.array(z.nativeEnum(TimeSlot)).default([]),
      rate_min: z.number().min(0).nullable(),
      rate_max: z.number().min(0).nullable(),
      has_transportation: z.boolean(),
      covid_vaccinated: z.boolean().nullable(),
      care_philosophy: z.string().max(500).nullable(),
      additional_certs: z.array(z.string().min(1)).default([]),
      // Step 4
      bio: z
        .string()
        .min(1)
        .max(limits.bioMaxLength)
        .refine((bio) => !isBioFromPlaceholder(bio), BIO_PLACEHOLDER_ERROR),
      photos: z.array(z.string()).min(1).max(limits.maxPhotos),
      // Step 5
      contact_email: z.string().email().or(z.literal("")).nullable(),
      contact_phone: z
        .string()
        .or(z.literal(""))
        .nullable()
        .superRefine((val, ctx) => {
          const err = validatePhone(val);
          if (err)
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: err,
            });
        }),
      communication_preference: z.nativeEnum(CommunicationPreference),
      zip_code: z.string().regex(/^\d{5}$/),
      travel_radius_miles: z.number().int().min(1).max(100),
    })
    .refine(
      (data) => {
        if (data.rate_min !== null && data.rate_max !== null) {
          return data.rate_max >= data.rate_min;
        }
        return true;
      },
      { message: "Max rate must be >= min rate", path: ["rate_max"] },
    )
    .refine(
      (data) => {
        const hasEmail = data.contact_email && data.contact_email.length > 0;
        const hasPhone = data.contact_phone && data.contact_phone.length > 0;
        return hasEmail || hasPhone;
      },
      {
        message: "Provide at least an email or phone number",
        path: ["contact_email"],
      },
    )
    .refine(
      (data) => {
        if (data.care_types.length <= 1) return true;
        return data.primary_care_type !== null;
      },
      {
        message: "Select a primary care type",
        path: ["primary_care_type"],
      },
    )
    .refine((data) => isLicenseNumberValid(data), {
      message: "License or certification number is required",
      path: ["license_number"],
    });
}

export type FullProfileData = z.infer<ReturnType<typeof fullProfileSchema>>;
