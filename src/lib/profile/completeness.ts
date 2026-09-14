import { COMPLETENESS_WEIGHTS } from "@/lib/constants";
import type { NurseProfile } from "@/types/database";

/** One thing she has not filled in, and what filling it earns. */
export interface MissingItem {
  label: string;
  points: number;
}

interface CompletenessResult {
  score: number;
  missing: MissingItem[];
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
 * What a freshly inserted nurse profile holds in every scored column: the
 * column defaults in the schema.
 *
 * The rule credits points before anything is filled in, so a new row earns
 * more than the column default of 0. Inserting without a score left every
 * nurse who stopped before finishing onboarding scored below what she earns,
 * which the weekly drift check then reported each Monday (#1063). The insert
 * scores these instead, and select-role-completeness.test.ts holds them to
 * the migration.
 */
export const NEW_PROFILE_COMPLETENESS_INPUT: CompletenessInput = {
  photos: [],
  bio: null,
  skills: [],
  care_philosophy: null,
  availability_commitment: [],
  time_slots: [],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  travel_radius_miles: null,
};

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
  const missing: MissingItem[] = [];

  // Photo (15 pts)
  if (profile.photos.length > 0) {
    score += COMPLETENESS_WEIGHTS.photo;
  } else {
    missing.push({
      label: "Add a professional photo",
      points: COMPLETENESS_WEIGHTS.photo,
    });
  }

  // Bio (15 pts)
  if (profile.bio && profile.bio.trim().length > 0) {
    score += COMPLETENESS_WEIGHTS.bio;
  } else {
    missing.push({
      label: "Write your bio",
      points: COMPLETENESS_WEIGHTS.bio,
    });
  }

  // Skills (10 pts)
  if (profile.skills.length > 0) {
    score += COMPLETENESS_WEIGHTS.skills;
  } else {
    missing.push({
      label: "Add your skills",
      points: COMPLETENESS_WEIGHTS.skills,
    });
  }

  // Care philosophy (10 pts)
  if (profile.care_philosophy && profile.care_philosophy.trim().length > 0) {
    score += COMPLETENESS_WEIGHTS.care_philosophy;
  } else {
    missing.push({
      label: "Share your care philosophy",
      points: COMPLETENESS_WEIGHTS.care_philosophy,
    });
  }

  // Availability commitment (10 pts)
  if (profile.availability_commitment.length > 0) {
    score += COMPLETENESS_WEIGHTS.availability_commitment;
  } else {
    missing.push({
      label: "Set your availability",
      points: COMPLETENESS_WEIGHTS.availability_commitment,
    });
  }

  // Time slots (5 pts)
  if (profile.time_slots.length > 0) {
    score += COMPLETENESS_WEIGHTS.time_slots;
  } else {
    missing.push({
      label: "Select your preferred time slots",
      points: COMPLETENESS_WEIGHTS.time_slots,
    });
  }

  // Rate range (10 pts)
  if (profile.rate_min !== null || profile.rate_max !== null) {
    score += COMPLETENESS_WEIGHTS.rate;
  } else {
    missing.push({
      label: "Add your hourly rate",
      points: COMPLETENESS_WEIGHTS.rate,
    });
  }

  // Transportation (5 pts)
  if (profile.has_transportation) {
    score += COMPLETENESS_WEIGHTS.has_transportation;
  } else {
    missing.push({
      label: "Indicate if you have transportation",
      points: COMPLETENESS_WEIGHTS.has_transportation,
    });
  }

  // COVID vaccination (5 pts)
  if (profile.covid_vaccinated !== null) {
    score += COMPLETENESS_WEIGHTS.covid_vaccinated;
  } else {
    missing.push({
      label: "Add your COVID vaccination status",
      points: COMPLETENESS_WEIGHTS.covid_vaccinated,
    });
  }

  // Travel radius (5 pts)
  if (profile.travel_radius_miles !== null) {
    score += COMPLETENESS_WEIGHTS.travel_radius_miles;
  } else {
    missing.push({
      label: "Set your travel radius",
      points: COMPLETENESS_WEIGHTS.travel_radius_miles,
    });
  }

  // Biggest wins first, so the top of the list is the part worth reading.
  // The card only shows the first few, and showing the 5 point items while a
  // 15 point one waits below would make the list read as busywork.
  missing.sort((a, b) => b.points - a.points);

  return { score, missing };
}
