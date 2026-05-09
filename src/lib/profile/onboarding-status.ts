import type { NurseProfile, User } from "@/types/database";

export type OnboardingStatus =
  | { complete: true }
  | { complete: false; nextStep: 1 | 2 | 3 | 4 | 5 };

/**
 * Determine where a nurse is in the onboarding wizard, based on what
 * fields have actually been saved to the DB.
 *
 * The dashboard's previous check looked at only years_experience and
 * (for HHA) license_number, so a nurse who bailed on Step 3, 4, or 5
 * landed on the steady-state dashboard with the "We're reviewing your
 * license" hero — even though they hadn't submitted. This helper checks
 * each step's required fields in order and reports the first one that's
 * missing.
 *
 * Steps map directly to the wizard's step indicator:
 *   1 Basics    – name, gender, years_experience, languages
 *   2 Credentials – credential type, license# (HHA only), care types
 *   3 Skills    – skills, availability, time slots
 *   4 Bio & Photos – bio, at least one photo
 *   5 Contact   – zip code, travel radius
 */
export function getOnboardingStatus(
  profile: NurseProfile,
  user: User,
): OnboardingStatus {
  // Step 1: Basics
  if (
    !user.first_name ||
    !user.last_name ||
    profile.years_experience == null ||
    !profile.languages?.length
  ) {
    return { complete: false, nextStep: 1 };
  }

  // Step 2: Credentials
  const hasLicense = profile.credential !== "hha" || !!profile.license_number;
  if (!profile.credential || !hasLicense || !profile.care_types?.length) {
    return { complete: false, nextStep: 2 };
  }

  // Step 3: Skills & details
  if (
    !profile.skills?.length ||
    !profile.availability_commitment?.length ||
    !profile.time_slots?.length
  ) {
    return { complete: false, nextStep: 3 };
  }

  // Step 4: Bio & Photos
  if (!profile.bio || !profile.photos?.length) {
    return { complete: false, nextStep: 4 };
  }

  // Step 5: Contact
  if (!user.zip_code || profile.travel_radius_miles == null) {
    return { complete: false, nextStep: 5 };
  }

  return { complete: true };
}
