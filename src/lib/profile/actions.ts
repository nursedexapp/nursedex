"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { UserRole, NurseTier } from "@/types/enums";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  fullProfileSchema,
} from "@/lib/schemas/profile";
import type { ZodError } from "zod";
import {
  calculateCompleteness,
  COMPLETENESS_COLUMNS,
  type CompletenessInput,
} from "./completeness";
import { claimSlug, saveSlugRedirect } from "./slug";
import { resubmissionPatch } from "./resubmission";
import {
  getSignedUploadUrl as _getSignedUploadUrl,
  validateUploadedPhoto,
  removePhoto,
} from "./photos";
import { sendProfileSetupEmail } from "@/lib/email/send";
import { shouldShowFeaturedUpsell, markUpsellShown } from "./upsell";
import { cancelActiveStripeSubscriptions } from "@/lib/stripe/cancel-subscriptions";

import { toTypedFailure, assertNoWriteError } from "@/lib/db/results";
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

/** Surface the first validation message so the user sees something actionable. */
function firstValidationError(error: ZodError): string {
  return (
    error.issues[0]?.message ??
    "Some details are invalid. Please review the form and try again."
  );
}

/** A nurse's tier drives the care-type, bio, and photo limits in the schemas. */
async function getNurseTier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<NurseTier | null> {
  // Null rather than FREE on a failure (#847). The tier picks which schema
  // validates the form, and FREE is the STRICTER one, so a failed read
  // silently rejects a Featured nurse's own bio, care types and photos as
  // being over a limit they do not have. A row that genuinely has no tier
  // still falls back to FREE, because that is a real answer.
  const read = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select("tier")
      .eq("user_id", userId)
      .single(),
    "this nurse's tier, which decides the form limits",
  );
  if (!read.ok) return null;
  return (read.data?.tier as NurseTier | undefined) ?? NurseTier.FREE;
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

  // Every branch validates with the same schema the client form uses, and
  // then writes what the schema RETURNED. Server actions are a public entry
  // point, so the form rules (including the credential-aware license number
  // requirement) must be enforced here too, not just client side; and writing
  // parsed.data rather than the submitted object is what makes the schema the
  // single description of a valid profile. Writing the raw input meant every
  // transform, trim and default existed only in the type system and never
  // reached the database (#963).

  // Step 1 updates both users table and nurse_profiles
  if (step === 1) {
    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      return { error: firstValidationError(parsed.error) };
    }
    const values = parsed.data;

    const { error: userError } = await supabase
      .from("users")
      .update({
        first_name: values.first_name,
        last_name: values.last_name,
      })
      .eq("id", user.id);

    if (userError) {
      console.error("Step 1 user update error:", userError.message);
      return { error: "Could not save your name. Please try again." };
    }

    const { error: profileError } = await supabase
      .from("nurse_profiles")
      .update({
        gender: values.gender,
        years_experience: values.years_experience,
        // Already normalised by the schema's transform.
        languages: values.languages,
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
    // Null rather than FREE on a failed tier read (#847): FREE is the stricter
    // schema, so validating against it would refuse a Featured nurse's own
    // care types as over a limit she does not have.
    const tier = await getNurseTier(supabase, user.id);
    if (tier === null) {
      return { error: "We could not save that just now. Please try again." };
    }
    const parsed = step2Schema(tier).safeParse(data);
    if (!parsed.success) {
      return { error: firstValidationError(parsed.error) };
    }
    const values = parsed.data;

    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        credential: values.credential,
        license_number: values.license_number.trim() || null,
        care_types: values.care_types,
        primary_care_type: values.primary_care_type,
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
    const parsed = step3Schema.safeParse(data);
    if (!parsed.success) {
      return { error: firstValidationError(parsed.error) };
    }
    const values = parsed.data;

    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        skills: values.skills,
        availability_commitment: values.availability_commitment,
        time_slots: values.time_slots,
        rate_min: values.rate_min,
        rate_max: values.rate_max,
        has_transportation: values.has_transportation,
        covid_vaccinated: values.covid_vaccinated,
        care_philosophy: values.care_philosophy,
        additional_certs: values.additional_certs,
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
    const tier = await getNurseTier(supabase, user.id);
    if (tier === null) {
      return { error: "We could not save that just now. Please try again." };
    }
    const parsed = step4Schema(tier).safeParse(data);
    if (!parsed.success) {
      return { error: firstValidationError(parsed.error) };
    }
    const values = parsed.data;

    const { error } = await supabase
      .from("nurse_profiles")
      .update({
        bio: values.bio,
        photos: values.photos,
        has_photo: values.photos.length > 0,
        photo_focal_x: values.photo_focal_x,
        photo_focal_y: values.photo_focal_y,
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
    const parsed = step5Schema.safeParse(data);
    if (!parsed.success) {
      return { error: firstValidationError(parsed.error) };
    }
    const values = parsed.data;

    const { error: userError } = await supabase
      .from("users")
      .update({
        phone: values.contact_phone || null,
        zip_code: values.zip_code,
        communication_preference: values.communication_preference,
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
        travel_radius_miles: values.travel_radius_miles,
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
  const profileRead = await toTypedFailure(
    supabase.from("nurse_profiles").select("*").eq("user_id", user.id).single(),
    "nurse_profiles (completeOnboarding)",
  );
  if (!profileRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const profile = profileRead.data;

  const userDataRead = await toTypedFailure(
    supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", user.id)
      .single(),
    "users (completeOnboarding)",
  );
  if (!userDataRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const userData = userDataRead.data;

  if (!profile || !userData) {
    return { error: "Profile not found" };
  }

  // Generate the real slug (replacing temp slug from role-select).
  // Slug uniqueness must be checked with the service-role client: under the
  // nurse's own RLS, pending (unverified) profiles of other nurses are hidden,
  // so a colliding slug would slip through and fail the slug UNIQUE constraint
  // on the update below ("Could not finalize profile").
  const slugDb = createServiceRoleClient();
  const { score } = calculateCompleteness(profile);

  // Claim a unique slug and write it. claimSlug retries on the rare race where
  // another profile grabs the same slug between the uniqueness check and the
  // write (Postgres 23505), regenerating with the next numeric suffix.
  const { slug: newSlug, error } = await claimSlug(
    slugDb,
    userData.first_name || "",
    userData.last_name || "",
    profile.credential,
    user.id,
    async (candidate) => {
      const { error: updateError } = await supabase
        .from("nurse_profiles")
        .update({
          slug: candidate,
          profile_completeness: score,
          // She finished the wizard. If she was rejected, this is her
          // resubmission: the edit form is unreachable to her (it requires a
          // complete profile), so without this she would fix exactly what she
          // was asked to fix and never re-enter the queue (#912).
          ...resubmissionPatch(profile.verification_status),
        })
        .eq("user_id", user.id);
      return updateError;
    },
  );

  if (error || !newSlug) {
    console.error("Complete onboarding error:", error?.code, error?.message);
    return {
      error: `Could not finalize profile: ${describeDbError(error)}. Please try again or contact support@nursedex.com.`,
    };
  }

  // Save the temp slug as a redirect now that the real slug is committed.
  if (profile.slug !== newSlug) {
    await saveSlugRedirect(slugDb, profile.slug, newSlug, user.id);
  }

  // Fire-and-forget: don't block onboarding completion on email delivery.
  // The sender reports its own failure (#977); there is nobody left to tell
  // by the time after() runs, so the report is the whole remedy.
  after(() =>
    sendProfileSetupEmail(userData.email, userData.first_name, newSlug),
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
  const currentProfileRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select("slug, credential, verification_status, tier")
      .eq("user_id", user.id)
      .single(),
    "nurse_profiles (updateNurseProfile)",
  );
  if (!currentProfileRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const currentProfile = currentProfileRead.data;

  if (!currentProfile) {
    return { error: "Profile not found" };
  }

  // Re-validate with the same schema the edit form uses. This action is a
  // public entry point, so the form rules (including the credential-aware
  // license number requirement) must be enforced here too, not just client side.
  const tier = (currentProfile.tier as NurseTier | undefined) ?? NurseTier.FREE;
  const parsed = fullProfileSchema(tier).safeParse(data);
  if (!parsed.success) {
    return { error: firstValidationError(parsed.error) };
  }
  // Everything below writes what the schema RETURNED, never the submitted
  // object, so a transform, trim or default added to fullProfileSchema
  // actually reaches the database (#963).
  const values = parsed.data;

  // Update users table (name, phone, zip, comm preference)
  const { error: userError } = await supabase
    .from("users")
    .update({
      first_name: values.first_name,
      last_name: values.last_name,
      phone: values.contact_phone || null,
      zip_code: values.zip_code,
      communication_preference: values.communication_preference,
    })
    .eq("id", user.id);

  if (userError) {
    console.error("Profile edit user update error:", userError.message);
    return { error: "Could not save changes. Please try again." };
  }

  // Check if slug needs regeneration (name or credential changed)
  const credentialChanged = currentProfile.credential !== values.credential;

  // Name change is detected by the users table trigger, but we
  // also need to regenerate the slug
  const freshUserRead = await toTypedFailure(
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single(),
    "users (updateNurseProfile)",
  );
  if (!freshUserRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const freshUser = freshUserRead.data;

  let needsNewSlug = false;
  if (freshUser) {
    const expectedSlugBase =
      `${freshUser.first_name}-${freshUser.last_name}-${values.credential}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-");
    needsNewSlug =
      !currentProfile.slug.startsWith(expectedSlugBase) || credentialChanged;
  }

  // If credential changed, the DB trigger will reset verification_status.
  // We just need to save the new credential.

  const photos = values.photos;

  // A rejected profile re-enters the review queue on save. The rule is shared
  // with the wizard's own completion path, which is where a nurse whose
  // profile is unfinished fixes it, since this form is unreachable until
  // onboarding is complete.
  const resubmission = resubmissionPatch(currentProfile.verification_status);

  // Build the profile update; the slug is set per-path below.
  const profileUpdate = {
    ...resubmission,
    credential: values.credential,
    license_number: values.license_number.trim() || null,
    care_types: values.care_types,
    primary_care_type: values.primary_care_type,
    skills: values.skills,
    gender: values.gender,
    years_experience: values.years_experience,
    // Already normalised by the schema's transform.
    languages: values.languages,
    bio: values.bio,
    photos,
    has_photo: photos.length > 0,
    photo_focal_x: values.photo_focal_x,
    photo_focal_y: values.photo_focal_y,
    rate_min: values.rate_min,
    rate_max: values.rate_max,
    has_transportation: values.has_transportation,
    covid_vaccinated: values.covid_vaccinated,
    care_philosophy: values.care_philosophy,
    additional_certs: values.additional_certs,
    availability_commitment: values.availability_commitment,
    time_slots: values.time_slots,
    travel_radius_miles: values.travel_radius_miles,
  };

  if (needsNewSlug && freshUser) {
    // Service-role client: see all profiles (incl. pending) for uniqueness;
    // claimSlug retries on the rare race that still slips through.
    const slugDb = createServiceRoleClient();
    const { slug: newSlug, error: claimError } = await claimSlug(
      slugDb,
      freshUser.first_name || "",
      freshUser.last_name || "",
      values.credential,
      user.id,
      async (candidate) => {
        const { error: updateError } = await supabase
          .from("nurse_profiles")
          .update({ ...profileUpdate, slug: candidate })
          .eq("user_id", user.id);
        return updateError;
      },
    );

    if (claimError || !newSlug) {
      console.error(
        "Profile edit update error:",
        claimError?.code,
        claimError?.message,
      );
      return {
        error: `Could not save changes: ${describeDbError(claimError)}. Please try again.`,
      };
    }

    if (currentProfile.slug !== newSlug) {
      await saveSlugRedirect(slugDb, currentProfile.slug, newSlug, user.id);
    }
  } else {
    const { error: profileError } = await supabase
      .from("nurse_profiles")
      .update({ ...profileUpdate, slug: currentProfile.slug })
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
  }

  // Recalculate completeness + read the upsell-gate fields in one round trip
  const updatedProfileRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      // Written out rather than composed from COMPLETENESS_COLUMNS: the Supabase
      // client parses this string at the TYPE level to give the row its shape,
      // and a template literal defeats that, costing the type safety on every
      // field below. completeness-columns.test.ts holds it to the same list
      // instead.
      .select(
        "photos, bio, skills, care_philosophy, availability_commitment, time_slots, rate_min, rate_max, has_transportation, covid_vaccinated, additional_certs, travel_radius_miles, languages, tier, verification_status, save_count_for_upsell, last_upsell_shown_at",
      )
      .eq("user_id", user.id)
      .single(),
    "nurse_profiles (updateNurseProfile)",
  );
  if (!updatedProfileRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const updatedProfile = updatedProfileRead.data;

  let upsellHint = false;
  if (updatedProfile) {
    const { score } = calculateCompleteness(updatedProfile);
    // Reported, not refused. The profile save above has already landed, so
    // returning a failure here would tell the nurse their edit did not happen
    // when it did. What a failed write costs is a stale completeness score
    // until the next save, and toTypedFailure files it either way.
    await toTypedFailure(
      supabase
        .from("nurse_profiles")
        .update({ profile_completeness: score })
        .eq("user_id", user.id),
      "the recalculated profile completeness score",
    );

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

  // Cancel Stripe first so a deleted account never keeps billing (#413).
  await cancelActiveStripeSubscriptions(supabase, user.id);

  // Throws rather than returns, which is the one deliberate exception to the
  // "use server returns" rule in #990, because the caller's own comment in
  // SettingsForm records that decision: "softDeleteAccount redirects on
  // success, and a genuine failure throws, which Sentry sees. Swallowing it
  // into a done state would be the worse bug." Unchecked, this reported a
  // deletion that never happened: Stripe was already cancelled above and the
  // person was signed out, so they believed they were gone while their
  // profile stayed public and their subscription stayed cancelled.
  await assertNoWriteError(
    supabase.from("users").update({ is_deleted: true }).eq("id", user.id),
    "the account deletion this person asked for",
  );

  await supabase.auth.signOut();
  // Bust the client Router Cache so no stale authed pages (rendered before the
  // account was deleted) linger after the redirect.
  revalidatePath("/", "layout");
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

  // Remove from profile's photos array.
  //
  // The whole scored row is read, not just the photos, so the completeness
  // score can be rewritten in the SAME update. A photo is the largest single
  // weight in that score, search ranks on the stored value, and the nurse's
  // own dashboard computes it live, so leaving it behind here means she keeps
  // credit in search for a photo she no longer has and the two screens
  // disagree about her (#727). One write rather than two, because a second
  // round trip leaves a window where the photo is gone and the score counts it.
  const profileRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select(COMPLETENESS_COLUMNS)
      .eq("user_id", user.id)
      .single<CompletenessInput>(),
    "nurse_profiles (deletePhoto)",
  );
  if (!profileRead.ok)
    return { error: "We could not save that just now. Please try again." };
  const profile = profileRead.data;

  if (profile) {
    const updatedPhotos = profile.photos.filter((p: string) => p !== path);
    const { score } = calculateCompleteness({
      ...profile,
      photos: updatedPhotos,
    });
    // Checked: this row is what the profile and the search index both read,
    // so an unchecked failure leaves the photo gone from storage and still
    // listed on the nurse, which is the two-screens-disagree defect #727 was
    // about.
    const write = await toTypedFailure(
      supabase
        .from("nurse_profiles")
        .update({
          photos: updatedPhotos,
          has_photo: updatedPhotos.length > 0,
          profile_completeness: score,
        })
        .eq("user_id", user.id),
      "the nurse's photo list after a deletion",
    );
    if (!write.ok) {
      return { error: "We could not save that just now. Please try again." };
    }
  }

  return { success: "Photo removed" };
}
