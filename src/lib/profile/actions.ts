"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import { calculateCompleteness } from "./completeness";
import { generateSlug, saveSlugRedirect } from "./slug";
import {
  getSignedUploadUrl as _getSignedUploadUrl,
  validateUploadedPhoto,
  removePhoto,
} from "./photos";
import { sendProfileSetupEmail } from "@/lib/email/send";
import { shouldShowFeaturedUpsell, markUpsellShown } from "./upsell";

export type ProfileActionResult = {
  error?: string;
  success?: string;
  upsellHint?: boolean;
};

/**
 * Turn a Postgres/Supabase error into a plain-language reason so the user
 * sees something actionable instead of a generic "try again". Codes:
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
function describeDbError(
  error: { code?: string; message?: string } | null | undefined,
): string {
  if (!error) return "an unexpected error occurred";
  switch (error.code) {
    case "23505":
      return "that conflicts with an existing profile (duplicate value)";
    case "23514":
      return "a value was outside the allowed range";
    case "23502":
      return "a required field was missing";
    case "23503":
      return "a related record could not be found";
    case "42501":
      return "you do not have permission to make this change";
    default:
      return error.message || "an unexpected database error occurred";
  }
}

// ── Fetch nurse profile for the current user ────────────────

export async function getNurseProfile() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nurse_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;
  return data;
}

// ── Save a single onboarding step ───────────────────────────

export async function saveOnboardingStep(
  step: number,
  data: Record<string, unknown>,
): Promise<ProfileActionResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Step 1 updates both users table and nurse_profiles
  if (step === 1) {
    const { error: userError } = await supabase
      .from("users")
      .update({
        first_name: data.first_name as string,
        last_name: data.last_name as string,
      })
      .eq("id", user.id);

    if (userError) {
      console.error("Step 1 user update error:", userError.message);
      return { error: "Could not save your name. Please try again." };
    }

    const { error: profileError } = await supabase
      .from("nurse_profiles")
      .update({
        gender: data.gender,
        years_experience: data.years_experience,
        languages: data.languages,
      })
      .eq("user_id", user.id);

    if (profileError) {
      console.error("Step 1 profile update error:", profileError.message);
      return { error: "Could not save your profile. Please try again." };
    }

    return { success: "Basics saved" };
  }

  // Step 2: Credentials
  if (step === 2) {
    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        credential: data.credential,
        license_number: data.license_number,
        care_types: data.care_types,
        primary_care_type: data.primary_care_type ?? null,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Step 2 update error:", error.message);
      return { error: "Could not save credentials. Please try again." };
    }

    return { success: "Credentials saved" };
  }

  // Step 3: Skills & Details
  if (step === 3) {
    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        skills: data.skills,
        availability_commitment: data.availability_commitment,
        time_slots: data.time_slots,
        rate_min: data.rate_min ?? null,
        rate_max: data.rate_max ?? null,
        has_transportation: data.has_transportation,
        covid_vaccinated: data.covid_vaccinated ?? null,
        care_philosophy: data.care_philosophy ?? null,
        additional_certs: data.additional_certs,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Step 3 update error:", error.message);
      return { error: "Could not save details. Please try again." };
    }

    return { success: "Skills and details saved" };
  }

  // Step 4: Bio & Photos
  if (step === 4) {
    const photos = (data.photos as string[]) || [];
    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        bio: data.bio,
        photos,
        has_photo: photos.length > 0,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Step 4 update error:", error.message);
      return { error: "Could not save bio. Please try again." };
    }

    return { success: "Bio and photos saved" };
  }

  // Step 5: Contact Info (updates users table + nurse_profiles)
  if (step === 5) {
    const { error: userError } = await supabase
      .from("users")
      .update({
        phone: (data.contact_phone as string) || null,
        zip_code: data.zip_code as string,
        communication_preference: data.communication_preference,
      })
      .eq("id", user.id);

    if (userError) {
      console.error(
        "Step 5 user update error:",
        userError.code,
        userError.message,
      );
      return {
        error: `Could not save contact info: ${describeDbError(userError)}. Please try again.`,
      };
    }

    const { error: profileError } = await supabase
      .from("nurse_profiles")
      .update({
        travel_radius_miles: data.travel_radius_miles,
      })
      .eq("user_id", user.id);

    if (profileError) {
      console.error(
        "Step 5 profile update error:",
        profileError.code,
        profileError.message,
      );
      return {
        error: `Could not save travel radius: ${describeDbError(profileError)}. Please try again.`,
      };
    }

    return { success: "Contact info saved" };
  }

  return { error: "Invalid step" };
}

// ── Complete onboarding (called after step 5) ───────────────

export async function completeOnboarding(): Promise<ProfileActionResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Fetch the current profile and user data
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const { data: userData } = await supabase
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || !userData) {
    return { error: "Profile not found" };
  }

  // Generate the real slug (replacing temp slug from role-select).
  // Slug uniqueness must be checked with the service-role client: under the
  // nurse's own RLS, pending (unverified) profiles of other nurses are hidden,
  // so a colliding slug would slip through and fail the slug UNIQUE constraint
  // on the update below ("Could not finalize profile").
  const slugDb = createServiceRoleClient();
  const newSlug = await generateSlug(
    slugDb,
    userData.first_name || "",
    userData.last_name || "",
    profile.credential,
    user.id,
  );

  // Save old slug as redirect
  if (profile.slug !== newSlug) {
    await saveSlugRedirect(slugDb, profile.slug, newSlug, user.id);
  }

  // Calculate completeness
  const { score } = calculateCompleteness(profile);

  // Update profile with final slug and completeness
  const { error } = await supabase
    .from("nurse_profiles")
    .update({
      slug: newSlug,
      profile_completeness: score,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Complete onboarding error:", error.code, error.message);
    return {
      error: `Could not finalize profile: ${describeDbError(error)}. Please try again or contact support@nursedex.com.`,
    };
  }

  // Fire-and-forget: don't block onboarding completion on email delivery
  after(() =>
    sendProfileSetupEmail(userData.email, userData.first_name, newSlug).catch(
      (err) => console.error("[email] Profile setup email error:", err),
    ),
  );

  return { success: "Profile saved. Verification next." };
}

// ── Update profile (edit page, saves all fields at once) ────

export async function updateNurseProfile(
  data: Record<string, unknown>,
): Promise<ProfileActionResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Fetch current profile for comparison
  const { data: currentProfile } = await supabase
    .from("nurse_profiles")
    .select("slug, credential")
    .eq("user_id", user.id)
    .single();

  if (!currentProfile) {
    return { error: "Profile not found" };
  }

  // Update users table (name, phone, zip, comm preference)
  const { error: userError } = await supabase
    .from("users")
    .update({
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      phone: (data.contact_phone as string) || null,
      zip_code: data.zip_code as string,
      communication_preference: data.communication_preference,
    })
    .eq("id", user.id);

  if (userError) {
    console.error("Profile edit user update error:", userError.message);
    return { error: "Could not save changes. Please try again." };
  }

  // Check if slug needs regeneration (name or credential changed)
  const credentialChanged = currentProfile.credential !== data.credential;
  let newSlug = currentProfile.slug;

  // Name change is detected by the users table trigger, but we
  // also need to regenerate the slug
  const { data: freshUser } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  if (freshUser) {
    const expectedSlugBase =
      `${freshUser.first_name}-${freshUser.last_name}-${data.credential as string}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-");

    if (
      !currentProfile.slug.startsWith(expectedSlugBase) ||
      credentialChanged
    ) {
      // Service-role client: see all profiles (incl. pending) when checking
      // slug uniqueness, otherwise RLS hides collisions until the update fails.
      const slugDb = createServiceRoleClient();
      newSlug = await generateSlug(
        slugDb,
        freshUser.first_name || "",
        freshUser.last_name || "",
        data.credential as string,
        user.id,
      );
      await saveSlugRedirect(slugDb, currentProfile.slug, newSlug, user.id);
    }
  }

  // If credential changed, the DB trigger will reset verification_status.
  // We just need to save the new credential.

  const photos = (data.photos as string[]) || [];

  // Build the profile update
  const profileUpdate = {
    slug: newSlug,
    credential: data.credential,
    license_number: data.license_number,
    care_types: data.care_types,
    primary_care_type: data.primary_care_type ?? null,
    skills: data.skills ?? [],
    gender: data.gender,
    years_experience: data.years_experience,
    languages: data.languages,
    bio: data.bio,
    photos,
    has_photo: photos.length > 0,
    rate_min: data.rate_min ?? null,
    rate_max: data.rate_max ?? null,
    has_transportation: data.has_transportation,
    covid_vaccinated: data.covid_vaccinated ?? null,
    care_philosophy: data.care_philosophy ?? null,
    additional_certs: data.additional_certs ?? [],
    availability_commitment: data.availability_commitment ?? [],
    time_slots: data.time_slots ?? [],
    travel_radius_miles: data.travel_radius_miles ?? null,
  };

  const { error: profileError } = await supabase
    .from("nurse_profiles")
    .update(profileUpdate)
    .eq("user_id", user.id);

  if (profileError) {
    console.error(
      "Profile edit update error:",
      profileError.code,
      profileError.message,
    );
    return {
      error: `Could not save changes: ${describeDbError(profileError)}. Please try again.`,
    };
  }

  // Recalculate completeness + read the upsell-gate fields in one round trip
  const { data: updatedProfile } = await supabase
    .from("nurse_profiles")
    .select(
      "photos, bio, skills, care_philosophy, availability_commitment, time_slots, rate_min, rate_max, has_transportation, covid_vaccinated, additional_certs, travel_radius_miles, languages, tier, verification_status, save_count_for_upsell, last_upsell_shown_at",
    )
    .eq("user_id", user.id)
    .single();

  let upsellHint = false;
  if (updatedProfile) {
    const { score } = calculateCompleteness(updatedProfile);
    await supabase
      .from("nurse_profiles")
      .update({ profile_completeness: score })
      .eq("user_id", user.id);

    if (shouldShowFeaturedUpsell(updatedProfile)) {
      upsellHint = true;
      await markUpsellShown(supabase, user.id);
    }
  }

  return { success: "Profile updated", upsellHint };
}

// ── Toggle availability ─────────────────────────────────────

export async function toggleAvailability(
  isAvailable: boolean,
  visibility?: "hidden" | "badge" | null,
): Promise<ProfileActionResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    is_available: isAvailable,
  };

  // Only set visibility when turning off availability
  if (!isAvailable && visibility) {
    update.unavailable_visibility = visibility;
  } else if (isAvailable) {
    update.unavailable_visibility = null;
  }

  const { error } = await supabase
    .from("nurse_profiles")
    .update(update)
    .eq("user_id", user.id);

  if (error) {
    console.error("Toggle availability error:", error.message);
    return { error: "Could not update availability. Please try again." };
  }

  return {
    success: isAvailable
      ? "You are now accepting new clients"
      : "Your availability has been updated",
  };
}

// ── Soft delete account ─────────────────────────────────────

export async function softDeleteAccount(): Promise<void> {
  const user = await requireAuth();
  const supabase = await createClient();

  await supabase.from("users").update({ is_deleted: true }).eq("id", user.id);

  await supabase.auth.signOut();
  redirect("/");
}

// ── Photo upload helpers (Server Action wrappers) ───────────

export async function requestPhotoUploadUrl(
  fileName: string,
): Promise<{ path: string; signedUrl: string } | { error: string }> {
  const user = await requireRole(UserRole.NURSE);
  return _getSignedUploadUrl(user.id, fileName);
}

export async function confirmPhotoUpload(
  path: string,
): Promise<{ valid: boolean; signedUrl?: string; error?: string }> {
  await requireRole(UserRole.NURSE);
  return validateUploadedPhoto(path);
}

export async function deletePhoto(path: string): Promise<ProfileActionResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Remove from storage
  await removePhoto(path);

  // Remove from profile's photos array
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("photos")
    .eq("user_id", user.id)
    .single();

  if (profile) {
    const updatedPhotos = profile.photos.filter((p: string) => p !== path);
    await supabase
      .from("nurse_profiles")
      .update({
        photos: updatedPhotos,
        has_photo: updatedPhotos.length > 0,
      })
      .eq("user_id", user.id);
  }

  return { success: "Photo removed" };
}
