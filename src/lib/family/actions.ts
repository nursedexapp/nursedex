"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { CommunicationPreference } from "@/types/enums";

const SURVEY_COOKIE_NAME = "nursedex_survey_params";

// Phone is required when the family wants nurses to reach them by phone or
// text, otherwise the chosen contact method has nothing to reach.
const phoneSatisfiesPreference = (data: {
  communication_preference: CommunicationPreference;
  phone?: string;
}) => {
  const needsPhone =
    data.communication_preference === CommunicationPreference.PHONE ||
    data.communication_preference === CommunicationPreference.TEXT;
  if (!needsPhone) return true;
  return !!data.phone && data.phone.trim().length > 0;
};

const phoneRequiredIssue = {
  message: "Add a phone number to be reached by phone or text",
  path: ["phone"],
};

const onboardingSchema = z
  .object({
    zip_code: z
      .string()
      .regex(/^\d{5}$/, "Please enter a valid 5-digit zip code"),
    communication_preference: z.nativeEnum(
      CommunicationPreference,
      "Pick a preferred contact method",
    ),
    phone: z
      .string()
      .regex(/^[\d\s()+-]*$/, "Please enter a valid phone number")
      .max(20, "Phone is too long")
      .optional()
      .or(z.literal("")),
    disclaimer_accepted: z.literal("on", "Please acknowledge the disclaimer"),
  })
  .refine(phoneSatisfiesPreference, phoneRequiredIssue);

export interface OnboardingResult {
  fieldErrors?: Record<string, string>;
  formError?: string;
}

/**
 * Persist family onboarding info and redirect:
 *   - to /nurses?<survey>&from=survey if a survey cookie was set
 *   - otherwise to /dashboard
 *
 * Caller is the form action; on success this redirects (does not return).
 */
export async function completeFamilyOnboarding(
  _previous: OnboardingResult | undefined,
  formData: FormData,
): Promise<OnboardingResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "family") redirect("/dashboard");

  const parsed = onboardingSchema.safeParse({
    zip_code: formData.get("zip_code"),
    communication_preference: formData.get("communication_preference"),
    phone: formData.get("phone") ?? "",
    disclaimer_accepted: formData.get("disclaimer_accepted"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();

  // Read survey cookie before any redirect so we can apply it on success.
  const cookieStore = await cookies();
  const surveyParams = cookieStore.get(SURVEY_COOKIE_NAME)?.value;

  // Update users row (zip + comm pref + phone if provided)
  const userUpdate: Record<string, string | null> = {
    zip_code: parsed.data.zip_code,
    communication_preference: parsed.data.communication_preference,
  };
  if (parsed.data.phone && parsed.data.phone.trim().length > 0) {
    userUpdate.phone = parsed.data.phone.trim();
  }
  const { error: userErr } = await supabase
    .from("users")
    .update(userUpdate)
    .eq("id", user.id);
  if (userErr) {
    return { formError: "Couldn't save your profile. Please try again." };
  }

  // Update family_profiles. If the user came from the survey, also mark
  // survey_completed so we don't nudge them on the dashboard.
  const familyUpdate: Record<string, string | boolean> = {
    zip_code: parsed.data.zip_code,
    communication_preference: parsed.data.communication_preference,
  };
  if (surveyParams) familyUpdate.survey_completed = true;

  const { error: familyErr } = await supabase
    .from("family_profiles")
    .update(familyUpdate)
    .eq("user_id", user.id);
  if (familyErr) {
    return { formError: "Couldn't save your preferences. Please try again." };
  }

  // Bust the client Router Cache so the (dashboard) layout's onboarding gate
  // re-evaluates with the just-saved zip. Without this the client replays its
  // cached "/dashboard -> /onboarding/family" redirect, and since onboarding
  // now redirects back to /dashboard (zip is set) the two ping-pong forever
  // until a hard refresh.
  revalidatePath("/", "layout");

  if (surveyParams) {
    cookieStore.delete(SURVEY_COOKIE_NAME);
    redirect(`/nurses?${surveyParams}&from=survey`);
  }
  redirect("/dashboard");
}

/**
 * Set the survey-handoff cookie. Called from the signup page when
 * `?survey=...` is present so the params survive the email-confirmation
 * round-trip and any role-select detour.
 */
export async function setSurveyHandoffCookie(params: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SURVEY_COOKIE_NAME, params, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
}

// ── Settings: family contact preferences ─────────────────────

const contactPrefsSchema = z
  .object({
    zip_code: z
      .string()
      .regex(/^\d{5}$/, "Please enter a valid 5-digit zip code"),
    communication_preference: z.nativeEnum(
      CommunicationPreference,
      "Pick a preferred contact method",
    ),
    phone: z
      .string()
      .regex(/^[\d\s()+-]*$/, "Please enter a valid phone number")
      .max(20, "Phone is too long")
      .optional()
      .or(z.literal("")),
  })
  .refine(phoneSatisfiesPreference, phoneRequiredIssue);

export interface UpdateContactResult {
  fieldErrors?: Record<string, string>;
  error?: string;
  success?: boolean;
}

/**
 * Update a family's contact preferences from the settings page.
 * Updates the same fields onboarding wrote (zip + comm pref + phone), on
 * both `users` and `family_profiles`.
 */
export async function updateFamilyContact(
  formData: FormData,
): Promise<UpdateContactResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role !== "family") return { error: "Wrong role" };

  const parsed = contactPrefsSchema.safeParse({
    zip_code: formData.get("zip_code"),
    communication_preference: formData.get("communication_preference"),
    phone: formData.get("phone") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const phone = parsed.data.phone?.trim() ?? "";

  const { error: userErr } = await supabase
    .from("users")
    .update({
      zip_code: parsed.data.zip_code,
      communication_preference: parsed.data.communication_preference,
      phone: phone.length > 0 ? phone : null,
    })
    .eq("id", user.id);
  if (userErr) return { error: "Couldn't save. Please try again." };

  const { error: familyErr } = await supabase
    .from("family_profiles")
    .update({
      zip_code: parsed.data.zip_code,
      communication_preference: parsed.data.communication_preference,
    })
    .eq("user_id", user.id);
  if (familyErr) return { error: "Couldn't save. Please try again." };

  return { success: true };
}
