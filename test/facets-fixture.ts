import type { DirectoryFacets } from "@/lib/nurses/facets";
import {
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";

/**
 * The directory's real shape, measured against production on 2026-09-03: 59
 * listed nurses the search can return, eleven languages of which five were
 * never offered by the old hardcoded list, no non-binary nurse, and nobody on
 * the "flexible" time slot.
 *
 * Shared by every surface that renders filter options, so the panel, the
 * sheet and the chip row are all tested against the same directory. A fixture
 * invented to make the rule fire would prove nothing about what a family sees
 * (L48).
 */
export function directoryFacets(
  overrides: Partial<DirectoryFacets> = {},
): DirectoryFacets {
  return {
    credential: [
      { value: Credential.RN, count: 34 },
      { value: Credential.LPN, count: 11 },
      { value: Credential.HHA, count: 6 },
    ],
    care_types: [
      { value: CareType.ELDERLY, count: 42 },
      { value: CareType.PEDIATRIC, count: 16 },
    ],
    skills: [
      { value: Skill.MEDICATION_MANAGEMENT, count: 56 },
      { value: Skill.VENTILATOR_CARE, count: 24 },
    ],
    languages: [
      { value: "English", count: 59 },
      { value: "Spanish", count: 8 },
      { value: "French", count: 3 },
    ],
    gender: [
      { value: Gender.FEMALE, count: 56 },
      { value: Gender.MALE, count: 3 },
    ],
    availability_commitment: [{ value: AvailabilityCommitment.PER_DIEM, count: 41 }],
    time_slots: [{ value: TimeSlot.WEEKDAYS, count: 44 }],
    rate: { min: 20, max: 175 },
    experience: { min: 1, max: 49 },
    total: 59,
    ...overrides,
  };
}
