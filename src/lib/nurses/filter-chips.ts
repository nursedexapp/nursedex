import {
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
  SKILL_LABELS,
  GENDER_LABELS,
  AVAILABILITY_COMMITMENT_LABELS,
  TIME_SLOT_LABELS,
  type Credential,
  type CareType,
  type Skill,
  type Gender,
  type AvailabilityCommitment,
  type TimeSlot,
} from "@/types/enums";
import { GENDER_FILTER_ANY, type SearchFilters } from "./search-params";

/**
 * The filter chip row, as data.
 *
 * Kept out of the components so each label and each applied state can be
 * asserted directly, and so the row and the "More filters" sheet cannot
 * disagree about which filters they own (#775).
 */

/** The seven filters that get their own chip on the row. */
export const ROW_CHIP_IDS = [
  "credential",
  "care_type",
  "skills",
  "languages",
  "gender",
  "rate_max",
  "experience_min",
] as const;

export type RowChipId = (typeof ROW_CHIP_IDS)[number];

/**
 * The four that live behind "More filters".
 *
 * Location is one of them, and it is the filter that most visibly constrains
 * results. A family arriving from the survey with a zip and a distance set
 * would otherwise see a chip row showing nothing applied above a thin grid,
 * with no visible cause. That is why an applied one still appears on the row
 * as its own clearable chip, and why the button carries a count.
 */
export const SHEET_CHIP_IDS = [
  "location",
  "availability_commitment",
  "time_slots",
  "show_unavailable",
] as const;

export type SheetChipId = (typeof SHEET_CHIP_IDS)[number];

/**
 * The "Saved only" chip (decision D10). Not in either list: it is on the row,
 * but only for a signed in family, so it is neither always present nor behind
 * More filters. It earns its place by composing with the other filters, which
 * /dashboard/saved cannot do.
 */
export const SAVED_CHIP_ID = "saved" as const;

export type ChipId = RowChipId | SheetChipId | typeof SAVED_CHIP_ID;

/** Every chip there is, for coverage checks. */
export const ALL_CHIP_IDS: ChipId[] = [
  ...ROW_CHIP_IDS,
  ...SHEET_CHIP_IDS,
  SAVED_CHIP_ID,
];

/** Every filter key a chip owns. Nothing may be owned by two chips, and
 *  nothing the URL carries may be owned by none. */
const KEYS_BY_CHIP: Record<ChipId, (keyof SearchFilters)[]> = {
  credential: ["credential"],
  care_type: ["care_type"],
  skills: ["skills"],
  languages: ["languages"],
  gender: ["gender"],
  rate_max: ["rate_min", "rate_max"],
  experience_min: ["experience_min"],
  saved: ["saved"],
  location: ["zip", "distance"],
  availability_commitment: ["availability_commitment"],
  time_slots: ["time_slots"],
  show_unavailable: ["show_unavailable"],
};

const RESTING_LABEL: Record<ChipId, string> = {
  credential: "Credential",
  care_type: "Care type",
  skills: "Skills",
  languages: "Languages",
  gender: "Gender",
  rate_max: "Rate",
  experience_min: "Experience",
  saved: "Saved only",
  location: "Location",
  availability_commitment: "Availability",
  time_slots: "Time of day",
  show_unavailable: "Also show",
};

/** True when this chip's filter is set to something other than its default. */
export function isChipApplied(id: ChipId, filters: SearchFilters): boolean {
  switch (id) {
    case "credential":
      return filters.credential !== undefined;
    case "care_type":
      return filters.care_type !== undefined;
    case "skills":
      return filters.skills.length > 0;
    case "languages":
      return filters.languages.length > 0;
    case "gender":
      return filters.gender !== GENDER_FILTER_ANY;
    case "rate_max":
      return filters.rate_min !== undefined || filters.rate_max !== undefined;
    case "experience_min":
      return filters.experience_min !== undefined;
    case "saved":
      return filters.saved;
    case "location":
      return filters.zip !== undefined;
    case "availability_commitment":
      return filters.availability_commitment.length > 0;
    case "time_slots":
      return filters.time_slots.length > 0;
    case "show_unavailable":
      return filters.show_unavailable;
  }
}

/**
 * What the chip says. Applied chips relabel themselves with the value, so the
 * row states what is filtering the results rather than only that something is
 * (decision D6).
 */
export function chipLabel(id: ChipId, filters: SearchFilters): string {
  if (!isChipApplied(id, filters)) return RESTING_LABEL[id];
  const resting = RESTING_LABEL[id];

  switch (id) {
    case "credential":
      return `${resting}: ${CREDENTIAL_LABELS[filters.credential as Credential] ?? filters.credential}`;
    case "care_type":
      return `${resting}: ${CARE_TYPE_LABELS[filters.care_type as CareType] ?? filters.care_type}`;
    case "skills":
      return `${resting}: ${summarise(filters.skills.map((s) => SKILL_LABELS[s as Skill] ?? s))}`;
    case "languages":
      return `${resting}: ${summarise(filters.languages)}`;
    case "gender":
      return `${resting}: ${GENDER_LABELS[filters.gender as Gender] ?? filters.gender}`;
    case "rate_max":
      return `${resting}: ${rateSummary(filters)}`;
    case "experience_min":
      return `${resting}: ${filters.experience_min}+ years`;
    case "saved":
      return "Saved only";
    case "location":
      return filters.distance !== undefined
        ? `${resting}: ${filters.distance} miles of ${filters.zip}`
        : `${resting}: ${filters.zip}`;
    case "availability_commitment":
      return `${resting}: ${summarise(
        filters.availability_commitment.map(
          (a) =>
            AVAILABILITY_COMMITMENT_LABELS[a as AvailabilityCommitment] ?? a,
        ),
      )}`;
    case "time_slots":
      return `${resting}: ${summarise(
        filters.time_slots.map((t) => TIME_SLOT_LABELS[t as TimeSlot] ?? t),
      )}`;
    case "show_unavailable":
      return "Including unavailable";
  }
}

/**
 * The patch that clears this chip, merged over whatever is in the URL at the
 * time. Every key the chip owns is reset to its own default, so clearing
 * "Rate" cannot leave half a range behind.
 */
export function clearChipPatch(id: ChipId): Partial<SearchFilters> {
  const patch: Record<string, unknown> = {};
  for (const key of KEYS_BY_CHIP[id]) patch[key] = defaultFor(key);
  return patch as Partial<SearchFilters>;
}

/** How many of the "More filters" group are applied, for the button's badge. */
export function sheetAppliedCount(filters: SearchFilters): number {
  return SHEET_CHIP_IDS.filter((id) => isChipApplied(id, filters)).length;
}

/**
 * Applied filters that live behind "More filters". They are rendered on the
 * row anyway, so nothing constraining the results is ever invisible.
 */
export function appliedSheetChips(filters: SearchFilters): SheetChipId[] {
  return SHEET_CHIP_IDS.filter((id) => isChipApplied(id, filters));
}

function defaultFor(key: keyof SearchFilters): unknown {
  switch (key) {
    case "skills":
    case "languages":
    case "availability_commitment":
    case "time_slots":
      return [];
    case "gender":
      return GENDER_FILTER_ANY;
    case "show_unavailable":
    case "saved":
      return false;
    default:
      return undefined;
  }
}

function rateSummary(filters: SearchFilters): string {
  const { rate_min: min, rate_max: max } = filters;
  if (min !== undefined && max !== undefined) return `$${min} to $${max}`;
  if (max !== undefined) return `up to $${max}`;
  return `from $${min}`;
}

/** "Spanish" for one, "Spanish and 2 more" beyond that, so a chip stays a chip. */
function summarise(values: string[]): string {
  if (values.length === 1) return values[0];
  return `${values[0]} and ${values.length - 1} more`;
}
