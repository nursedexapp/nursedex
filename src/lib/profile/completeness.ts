import { COMPLETENESS_WEIGHTS } from "@/lib/constants";
import type { NurseProfile } from "@/types/database";

interface CompletenessResult {
  score: number;
  missing: string[];
}

/**
 * Calculate profile completeness from 0-100 based on optional fields.
 * Required fields (name, credential, license, care types, contact) are
 * not counted here since the onboarding wizard enforces them.
 */
export function calculateCompleteness(
  profile: Pick<
    NurseProfile,
    | "photos"
    | "bio"
    | "skills"
    | "care_philosophy"
    | "availability_commitment"
    | "time_slots"
    | "rate_min"
    | "rate_max"
    | "has_transportation"
    | "covid_vaccinated"
    | "additional_certs"
    | "travel_radius_miles"
    | "languages"
  >,
): CompletenessResult {
  let score = 0;
  const missing: string[] = [];

  // Photo (15 pts)
  if (profile.photos.length > 0) {
    score += COMPLETENESS_WEIGHTS.photo;
  } else {
    missing.push("Add a professional photo");
  }

  // Bio (15 pts)
  if (profile.bio && profile.bio.trim().length > 0) {
    score += COMPLETENESS_WEIGHTS.bio;
  } else {
    missing.push("Write your bio");
  }

  // Skills (10 pts)
  if (profile.skills.length > 0) {
    score += COMPLETENESS_WEIGHTS.skills;
  } else {
    missing.push("Add your skills");
  }

  // Care philosophy (10 pts)
  if (profile.care_philosophy && profile.care_philosophy.trim().length > 0) {
    score += COMPLETENESS_WEIGHTS.care_philosophy;
  } else {
    missing.push("Share your care philosophy");
  }

  // Availability commitment (10 pts)
  if (profile.availability_commitment.length > 0) {
    score += COMPLETENESS_WEIGHTS.availability_commitment;
  } else {
    missing.push("Set your availability");
  }

  // Time slots (5 pts)
  if (profile.time_slots.length > 0) {
    score += COMPLETENESS_WEIGHTS.time_slots;
  } else {
    missing.push("Select your preferred time slots");
  }

  // Rate range (10 pts)
  if (profile.rate_min !== null || profile.rate_max !== null) {
    score += COMPLETENESS_WEIGHTS.rate;
  } else {
    missing.push("Add your hourly rate");
  }

  // Transportation (5 pts)
  if (profile.has_transportation) {
    score += COMPLETENESS_WEIGHTS.has_transportation;
  } else {
    missing.push("Indicate if you have transportation");
  }

  // COVID vaccination (5 pts)
  if (profile.covid_vaccinated !== null) {
    score += COMPLETENESS_WEIGHTS.covid_vaccinated;
  } else {
    missing.push("Add your COVID vaccination status");
  }

  // Additional certifications (5 pts)
  if (profile.additional_certs.length > 0) {
    score += COMPLETENESS_WEIGHTS.additional_certs;
  } else {
    missing.push("List any additional certifications");
  }

  // Travel radius (5 pts)
  if (profile.travel_radius_miles !== null) {
    score += COMPLETENESS_WEIGHTS.travel_radius_miles;
  } else {
    missing.push("Set your travel radius");
  }

  // Extra languages beyond English (5 pts)
  if (profile.languages.length > 1) {
    score += COMPLETENESS_WEIGHTS.languages_extra;
  } else {
    missing.push("Add additional languages you speak");
  }

  return { score, missing };
}
