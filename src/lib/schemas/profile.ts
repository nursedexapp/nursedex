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
import { normalizeLanguageList } from "@/lib/profile/language";

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
  // Normalised on the way in, not only in the form component, so a write that
  // did not come through the wizard cannot store a spelling the directory's
  // language filter will then show back to families (#934). The min(1) runs
  // after the transform, so a list of nothing but blanks is still refused.
  languages: z
    .array(z.string().min(1))
    .transform(normalizeLanguageList)
    .refine((langs) => langs.length >= 1, "At least one language is required"),
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

/**
 * The three step 3 lists a profile cannot be finished without (#905).
 *
 * Declared once and spread into both step3Schema (the wizard) and
 * fullProfileSchema (the edit form), because these are the fields
 * getOnboardingStatus gates the dashboard, the edit page and the preview on.
 * A second, looser copy is what created the lockout in the first place: the
 * wizard waved a nurse past all three empty and the gate then refused to let
 * her out of the wizard. onboarding-status.test.ts pins the two ends together.
 */
const STEP_3_REQUIRED = {
  skills: z
    .array(z.nativeEnum(Skill))
    .min(1, "Pick at least one skill so families can find you"),
  availability_commitment: z
    .array(z.nativeEnum(AvailabilityCommitment))
    .min(1, "Pick at least one availability so families know when you work"),
  time_slots: z
    .array(z.nativeEnum(TimeSlot))
    .min(1, "Pick at least one time slot so families know when you work"),
};

export const step3Schema = z
  .object({
    ...STEP_3_REQUIRED,
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

/**
 * The bio field, defined once.
 *
 * It was defined twice, in step4Schema and in the full profile schema, which
 * is how a rule comes to hold on one save path and not the other. Trimming
 * matters here beyond tidiness: a bio of only whitespace passed min(1) and
 * reached the database, where the directory counts it as a bio (#732) while
 * completeness scoring trims first and gives no credit, so such a nurse would
 * be listed with a blank card.
 */
/**
 * Where her face is in her photo, as a percentage (#768).
 *
 * Defaulted rather than required, so a form that never showed the picker
 * still saves. A value that IS present and outside the photo is refused
 * rather than quietly replaced: the picker cannot produce one, so it means a
 * bug or tampering, and silently storing the middle instead would move her
 * photo without telling her.
 */
const focalCoordinate = z.number().int().min(0).max(100).default(50);

function bioField(limits: { bioMaxLength: number }) {
  return z
    .string()
    .trim()
    .min(1, "A bio is required")
    .max(
      limits.bioMaxLength,
      `Bio must be under ${limits.bioMaxLength} characters`,
    )
    .refine((bio) => !isBioFromPlaceholder(bio), BIO_PLACEHOLDER_ERROR);
}

export function step4Schema(tier: NurseTier) {
  const limits = TIER_LIMITS[tier];

  return z.object({
    bio: bioField(limits),
    photo_focal_x: focalCoordinate,
    photo_focal_y: focalCoordinate,
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
      languages: z
        .array(z.string().min(1))
        .transform(normalizeLanguageList)
        .refine((langs) => langs.length >= 1),
      // Step 2
      credential: z.nativeEnum(Credential),
      license_number: z.string().max(30),
      care_types: z
        .array(z.nativeEnum(CareType))
        .min(1)
        .max(limits.maxCareTypes === Infinity ? 100 : limits.maxCareTypes),
      primary_care_type: z.nativeEnum(CareType).nullable(),
      // Step 3. The same objects the wizard validates with, not a second
      // copy: the edit form saves through this schema, so a looser rule here
      // would let a nurse empty these fields and lock herself back out.
      ...STEP_3_REQUIRED,
      rate_min: z.number().min(0).nullable(),
      rate_max: z.number().min(0).nullable(),
      has_transportation: z.boolean(),
      covid_vaccinated: z.boolean().nullable(),
      care_philosophy: z.string().max(500).nullable(),
      additional_certs: z.array(z.string().min(1)).default([]),
      // Step 4
      bio: bioField(limits),
      photo_focal_x: focalCoordinate,
      photo_focal_y: focalCoordinate,
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
