import { COMPLETENESS_WEIGHTS } from "@/lib/constants";
import type { NurseProfile } from "@/types/database";

interface CompletenessResult {
  score: number;
  missing: string[];
}

/**
 * Every profile field the score is computed from, named once.
 *
 * The type below is derived from this list, so a field added to the scoring
 * without being added here is a compile error rather than a column some
 * caller forgets to read. That mattered: search ranks on the STORED score, so
 * a caller that recomputes from a partial row would quietly write a lower
 * score than the nurse has earned (#727).
 */
export const COMPLETENESS_FIELDS = [
  "photos",
  "bio",
  "skills",
  "care_philosophy",
  "availability_commitment",
  "time_slots",
  "rate_min",
  "rate_max",
  "has_transportation",
  "covid_vaccinated",
  "travel_radius_miles",
] as const;

/** The same list as a PostgREST select, for callers that read a row to score it. */
export const COMPLETENESS_COLUMNS = COMPLETENESS_FIELDS.join(", ");

export type CompletenessInput = Pick<
  NurseProfile,
  (typeof COMPLETENESS_FIELDS)[number]
>;

/**
 * Calculate profile completeness from 0-100 based on optional fields.
 * Required fields (name, credential, license, care types, contact) are
 * not counted here since the onboarding wizard enforces them.
 */
export function calculateCompleteness(
  profile: CompletenessInput,
): CompletenessResult {
  // additional_certs and languages_extra credit automatically: every nurse provides
  // their credential and at least one language during onboarding, so flagging them
  // as "missing" on the dashboard nags about choices already made at signup.
  let score =
    COMPLETENESS_WEIGHTS.additional_certs +
    COMPLETENESS_WEIGHTS.languages_extra;
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

  // Travel radius (5 pts)
  if (profile.travel_radius_miles !== null) {
    score += COMPLETENESS_WEIGHTS.travel_radius_miles;
  } else {
    missing.push("Set your travel radius");
  }

  return { score, missing };
}
