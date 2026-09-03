import {
  CREDENTIAL_LABELS,
  CARE_TYPE_LABELS,
  SKILL_LABELS,
  GENDER_LABELS,
  AVAILABILITY_COMMITMENT_LABELS,
  TIME_SLOT_LABELS,
} from "@/types/enums";
import type { FacetOption } from "./facets";

/**
 * How one filter option is written on screen.
 *
 * Shared by the panel, the sheet and the chip row, which each held their own
 * copy of the language list and their own way of labelling an option (#766).
 *
 * A value with no label falls back to the value itself rather than to an
 * empty string. These come from the database now, so a care type or skill
 * added to the data before the label map would otherwise render as a blank
 * checkbox nobody could identify (L113).
 */
const LABEL_MAPS: Record<string, Record<string, string> | undefined> = {
  credential: CREDENTIAL_LABELS,
  care_types: CARE_TYPE_LABELS,
  skills: SKILL_LABELS,
  gender: GENDER_LABELS,
  availability_commitment: AVAILABILITY_COMMITMENT_LABELS,
  time_slots: TIME_SLOT_LABELS,
  // Languages are free text on the profile, so the stored value IS the label.
  languages: undefined,
};

export function facetLabel(facet: string, value: string): string {
  return LABEL_MAPS[facet]?.[value] ?? value;
}

/**
 * The label a family reads, carrying how many nurses are behind it, so she
 * can see where the depth is before she clicks (#766).
 */
export function facetOptionLabel(facet: string, option: FacetOption): string {
  return `${facetLabel(facet, option.value)} (${option.count})`;
}
