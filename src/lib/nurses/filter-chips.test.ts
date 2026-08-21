import { describe, it, expect } from "vitest";
import {
  ROW_CHIP_IDS,
  SHEET_CHIP_IDS,
  appliedSheetChips,
  chipLabel,
  clearChipPatch,
  isChipApplied,
  type ChipId,
} from "./filter-chips";
import {
  GENDER_FILTER_ANY,
  parseSearchParams,
  searchParamsSchema,
  toURLSearchParams,
} from "./search-params";

const filters = (raw: Record<string, string> = {}) => parseSearchParams(raw);

describe("the chip vocabulary", () => {
  // Every filter in the URL schema must belong to exactly one chip. A filter
  // owned by none is invisible on the row and unclearable; one owned by two
  // gives the family two controls that fight over the same value.
  it("covers every filter the URL carries, once each", () => {
    const owned = [...ROW_CHIP_IDS, ...SHEET_CHIP_IDS].flatMap((id) =>
      Object.keys(clearChipPatch(id)),
    );
    expect(new Set(owned).size).toBe(owned.length);

    const schemaKeys = Object.keys(searchParamsSchema.shape).filter(
      (k) => k !== "page",
    );
    expect([...owned].sort()).toEqual(schemaKeys.sort());
  });

  it("puts seven chips on the row and four behind More filters", () => {
    expect(ROW_CHIP_IDS).toHaveLength(7);
    expect(SHEET_CHIP_IDS).toHaveLength(4);
  });
});

describe("isChipApplied", () => {
  it("is false for every chip on an untouched search", () => {
    const f = filters();
    for (const id of [...ROW_CHIP_IDS, ...SHEET_CHIP_IDS]) {
      expect(isChipApplied(id, f), `${id} should be unapplied`).toBe(false);
    }
  });

  // "any" is the resting value for gender, not a filter.
  it("treats the default gender as unapplied", () => {
    expect(
      isChipApplied("gender", filters({ gender: GENDER_FILTER_ANY })),
    ).toBe(false);
    expect(isChipApplied("gender", filters({ gender: "female" }))).toBe(true);
  });

  it("counts a rate floor on its own", () => {
    expect(isChipApplied("rate_max", filters({ rate_min: "20" }))).toBe(true);
  });

  it("counts a zip without a distance as a location filter", () => {
    expect(isChipApplied("location", filters({ zip: "11779" }))).toBe(true);
  });

  it("counts the show unavailable toggle", () => {
    expect(
      isChipApplied("show_unavailable", filters({ show_unavailable: "true" })),
    ).toBe(true);
  });
});

describe("chipLabel", () => {
  it("names the filter at rest", () => {
    expect(chipLabel("credential", filters())).toBe("Credential");
  });

  // Decision D6: an applied chip relabels itself with the value.
  it("carries the value once applied", () => {
    expect(chipLabel("credential", filters({ credential: "rn" }))).toBe(
      "Credential: Registered Nurse",
    );
  });

  it("summarises a multi-value filter rather than growing without limit", () => {
    const label = chipLabel(
      "languages",
      filters({ languages: "Spanish,Italian,Polish" }),
    );
    expect(label).toBe("Languages: Spanish and 2 more");
  });

  it("says the single value when there is only one", () => {
    expect(chipLabel("languages", filters({ languages: "Spanish" }))).toBe(
      "Languages: Spanish",
    );
  });

  it("reads a rate range, a floor and a ceiling differently", () => {
    expect(
      chipLabel("rate_max", filters({ rate_min: "20", rate_max: "40" })),
    ).toBe("Rate: $20 to $40");
    expect(chipLabel("rate_max", filters({ rate_max: "40" }))).toBe(
      "Rate: up to $40",
    );
    expect(chipLabel("rate_max", filters({ rate_min: "20" }))).toBe(
      "Rate: from $20",
    );
  });

  it("reads a location with and without a radius", () => {
    expect(
      chipLabel("location", filters({ zip: "11779", distance: "25" })),
    ).toBe("Location: 25 miles of 11779");
    expect(chipLabel("location", filters({ zip: "11779" }))).toBe(
      "Location: 11779",
    );
  });

  it("says what the unavailable toggle actually does", () => {
    expect(
      chipLabel("show_unavailable", filters({ show_unavailable: "true" })),
    ).toBe("Including unavailable");
  });

  it("never leaves a chip unlabelled", () => {
    const applied = filters({
      credential: "rn",
      care_type: "elderly",
      skills: "feeding_tube",
      languages: "Spanish",
      gender: "female",
      rate_max: "40",
      experience_min: "5",
      zip: "11779",
      distance: "25",
      availability_commitment: "part_time",
      time_slots: "overnights",
      show_unavailable: "true",
    });
    for (const id of [...ROW_CHIP_IDS, ...SHEET_CHIP_IDS] as ChipId[]) {
      expect(
        chipLabel(id, applied).length,
        `${id} has no label`,
      ).toBeGreaterThan(0);
      expect(chipLabel(id, applied)).not.toContain("undefined");
    }
  });
});

describe("clearChipPatch", () => {
  // Clearing "Rate" has to take both ends. Leaving half a range behind is a
  // filter the family can no longer see and can no longer clear.
  it("clears every key the chip owns", () => {
    const before = filters({ rate_min: "20", rate_max: "40" });
    const after = { ...before, ...clearChipPatch("rate_max") };
    expect(isChipApplied("rate_max", after)).toBe(false);
    expect(toURLSearchParams(after).toString()).toBe("");
  });

  it("clears a location's zip and its distance together", () => {
    const before = filters({ zip: "11779", distance: "25" });
    const after = { ...before, ...clearChipPatch("location") };
    expect(toURLSearchParams(after).toString()).toBe("");
  });

  it("restores a list filter to empty rather than undefined", () => {
    const before = filters({ skills: "feeding_tube" });
    const after = { ...before, ...clearChipPatch("skills") };
    expect(after.skills).toEqual([]);
  });

  it("restores gender to any rather than undefined", () => {
    const before = filters({ gender: "female" });
    const after = { ...before, ...clearChipPatch("gender") };
    expect(after.gender).toBe(GENDER_FILTER_ANY);
  });

  it("leaves the other filters alone", () => {
    const before = filters({ credential: "rn", zip: "11779" });
    const after = { ...before, ...clearChipPatch("location") };
    expect(after.credential).toBe("rn");
  });

  it("clears every chip, for every chip", () => {
    const applied = filters({
      credential: "rn",
      care_type: "elderly",
      skills: "feeding_tube",
      languages: "Spanish",
      gender: "female",
      rate_min: "20",
      rate_max: "40",
      experience_min: "5",
      zip: "11779",
      distance: "25",
      availability_commitment: "part_time",
      time_slots: "overnights",
      show_unavailable: "true",
    });
    let running = applied;
    for (const id of [...ROW_CHIP_IDS, ...SHEET_CHIP_IDS] as ChipId[]) {
      running = { ...running, ...clearChipPatch(id) };
    }
    expect(toURLSearchParams(running).toString()).toBe("");
  });
});

describe("appliedSheetChips", () => {
  // The hidden group's applied filters still appear on the row, so a family
  // arriving from the survey with a zip set can see and clear it.
  it("is empty when nothing behind More filters is set", () => {
    expect(appliedSheetChips(filters({ credential: "rn" }))).toEqual([]);
  });

  it("names the hidden filters that are constraining the results", () => {
    expect(
      appliedSheetChips(filters({ zip: "11779", time_slots: "overnights" })),
    ).toEqual(["location", "time_slots"]);
  });
});
