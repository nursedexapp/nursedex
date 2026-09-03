import {
  AVAILABILITY_COMMITMENT_LABELS,
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
} from "@/types/enums";
import type {
  AvailabilityCommitment,
  Credential,
  CareType,
} from "@/types/enums";
import type { NurseSearchCard } from "@/lib/nurses/card";

/**
 * Every sentence the nurse card's footer can say, derived from the card.
 *
 * Kept out of the component so each case can be asserted directly. The rule
 * that matters: the locked wording is DERIVED from that nurse's record, never
 * asserted. A card promising "log in to see rate and availability" for a nurse
 * who has set neither sends a family to sign up and meet a blank (#774).
 */

/** What a nurse charges, or why the card cannot say. */
export function rateLabel(nurse: NurseSearchCard): string {
  if (nurse.rate_min !== null && nurse.rate_max !== null) {
    return nurse.rate_min === nurse.rate_max
      ? `${money(nurse.rate_min)} an hour`
      : `${money(nurse.rate_min)} to ${money(nurse.rate_max)} an hour`;
  }
  if (nurse.rate_min !== null) return `From ${money(nurse.rate_min)} an hour`;
  if (nurse.rate_max !== null) return `Up to ${money(nurse.rate_max)} an hour`;
  return "Rate not set";
}

/** When a nurse can work, or why the card cannot say. */
export function availabilityLabel(nurse: NurseSearchCard): string {
  if (nurse.availability_commitment.length === 0) return "Availability not set";
  return nurse.availability_commitment
    .map(
      (a) =>
        AVAILABILITY_COMMITMENT_LABELS[a as AvailabilityCommitment] ??
        a.replace(/_/g, " "),
    )
    .join(", ");
}

/**
 * The one sentence a logged out visitor sees in place of the footer.
 *
 * Null when there is nothing to unlock, so the card can fall through to the
 * honest "not set" wording rather than advertising something absent.
 */
export function lockedFooterLabel(nurse: NurseSearchCard): string | null {
  if (nurse.has_rate && nurse.has_availability) {
    return "Log in to see rate and availability";
  }
  if (nurse.has_rate) return "Log in to see the rate";
  if (nurse.has_availability) return "Log in to see availability";
  return null;
}

/** Credential and years, with the years dropped when there are none on file. */
export function credentialLine(nurse: NurseSearchCard): string {
  const credential =
    CREDENTIAL_LABELS[nurse.credential as Credential] ?? nurse.credential;
  if (nurse.years_experience === null) return credential;
  const years = nurse.years_experience;
  return `${credential} · ${years} ${years === 1 ? "year" : "years"}`;
}

/** The care type shown on the pill, or null when the nurse has named none. */
export function careTypeLabel(nurse: NurseSearchCard): string | null {
  const value = nurse.primary_care_type ?? nurse.care_types[0] ?? null;
  if (!value) return null;
  return CARE_TYPE_LABELS[value as CareType] ?? value;
}

/**
 * How far away, in words, or null when there is nothing to state.
 *
 * distance_miles is rounded, so 0 means "under half a mile", not "exactly
 * here". Printing "0 miles away" states something that is not true and reads
 * as a bug to anyone who sees it.
 *
 * `measured` says whether a distance was expected at all. Without it a card
 * with no distance means two different things and reads the same either way:
 * the family gave no zip, or this nurse cannot be placed. The second is real,
 * and silent: three nurses on the roster live outside New York, and the zip
 * lookup only holds New York, so they can never be measured. Under
 * nearest-first they sort last for a reason the card should say out loud
 * rather than leave as a blank space (#723).
 */
export function distanceLabel(
  nurse: NurseSearchCard,
  { measured }: { measured: boolean } = { measured: false },
): string | null {
  const miles = nurse.distance_miles;
  if (miles === null) return measured ? "Location not on file" : null;
  if (miles === 0) return "Less than a mile away";
  return `${miles} ${miles === 1 ? "mile" : "miles"} away`;
}

/** Town and state, or null when we could not place the nurse's zip. */
export function townLabel(nurse: NurseSearchCard): string | null {
  if (!nurse.city) return null;
  return nurse.state ? `${nurse.city}, ${nurse.state}` : nurse.city;
}

/** The name as the card shows it: first name, plus whatever we may add. */
export function displayName(
  nurse: NurseSearchCard,
  { showLastName }: { showLastName: boolean },
): string {
  if (showLastName && nurse.last_name) {
    return `${nurse.first_name} ${nurse.last_name}`;
  }
  if (nurse.last_initial) return `${nurse.first_name} ${nurse.last_initial}.`;
  return nurse.first_name;
}

function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}
