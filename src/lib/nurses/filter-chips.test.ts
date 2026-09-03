import { describe, it, expect } from "vitest";
import {
  ALL_CHIP_IDS,
  ROW_CHIP_IDS,
  SAVED_CHIP_ID,
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

const _unusedChipId: ChipId = "saved";

const filters = (raw: Record<string, string> = {}) => parseSearchParams(raw);

describe("the chip vocabulary", () => {
  // Every filter in the URL schema must belong to exactly one chip. A filter
  // owned by none is invisible on the row and unclearable; one owned by two
  // gives the family two controls that fight over the same value.
  it("covers every filter the URL carries, once each", () => {
    const owned = ALL_CHIP_IDS.flatMap((id) => Object.keys(clearChipPatch(id)));
    expect(new Set(owned).size).toBe(owned.length);

    // page and sort are in the URL but are not filters: neither narrows the
    // results, so neither belongs to a chip that clears it.
    const notFilters = ["page", "sort"];
    // q narrows the results and is deliberately not a chip: it has its own
    // box above the row, which shows what was typed and carries its own
    // clear, at rest rather than behind a popover (#729). That control is
    // what this rule is protecting, and KeywordSearch.test.tsx holds it to
    // showing the keyword and clearing it.
    const ownControl = ["q"];
    const schemaKeys = Object.keys(searchParamsSchema.shape).filter(
      (k) => !notFilters.includes(k) && !ownControl.includes(k),
    );
    expect([...owned].sort()).toEqual(schemaKeys.sort());
  });

  it("puts seven chips on the row and four behind More filters", () => {
    expect(ROW_CHIP_IDS).toHaveLength(7);
    expect(SHEET_CHIP_IDS).toHaveLength(4);
  });

  // Saved only sits on the row but only for a signed in family, so it belongs
  // to neither fixed list and is easy to leave out of a coverage check.
  it("counts the Saved only chip as its own thing", () => {
    expect(ROW_CHIP_IDS).not.toContain(SAVED_CHIP_ID);
    expect(SHEET_CHIP_IDS).not.toContain(SAVED_CHIP_ID);
    expect(ALL_CHIP_IDS).toContain(SAVED_CHIP_ID);
  });
});

describe("isChipApplied", () => {
  it("is false for every chip on an untouched search", () => {
    const f = filters();
    for (const id of ALL_CHIP_IDS) {
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
    for (const id of ALL_CHIP_IDS) {
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
    let running = { ...applied, saved: true };
    for (const id of ALL_CHIP_IDS) {
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

describe("the Saved only chip", () => {
  it("is unapplied by default", () => {
    expect(isChipApplied(SAVED_CHIP_ID, filters())).toBe(false);
  });

  it("is applied when the flag is on", () => {
    expect(isChipApplied(SAVED_CHIP_ID, filters({ saved: "true" }))).toBe(true);
  });

  it("reads the same whether applied or not, since the count is separate", () => {
    expect(chipLabel(SAVED_CHIP_ID, filters({ saved: "true" }))).toBe(
      "Saved only",
    );
  });

  it("clears back off", () => {
    const after = {
      ...filters({ saved: "true" }),
      ...clearChipPatch(SAVED_CHIP_ID),
    };
    expect(after.saved).toBe(false);
    expect(toURLSearchParams(after).toString()).toBe("");
  });
});
