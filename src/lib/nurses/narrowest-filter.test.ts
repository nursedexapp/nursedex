import { describe, it, expect } from "vitest";
import { narrowestAppliedFilter } from "./narrowest-filter";
import { parseSearchParams } from "./search-params";
import { directoryFacets } from "../../../test/facets-fixture";
import { CareType, Credential } from "@/types/enums";

/**
 * #766 accepts that a family who applies several filters at once can still
 * reach zero results, on condition that the empty state offers to drop the
 * narrowest of them. The counts make that computable: the narrowest applied
 * filter is the one with the fewest nurses behind it.
 */

describe("narrowestAppliedFilter", () => {
  it("says nothing when only one filter is applied, since clearing it is the same as clearing everything", () => {
    const filters = parseSearchParams({ languages: "French" });

    expect(narrowestAppliedFilter(filters, directoryFacets())).toBeNull();
  });

  it("names the applied option with the fewest nurses behind it", () => {
    const filters = parseSearchParams({
      languages: "French",
      credential: Credential.RN,
    });

    const suggestion = narrowestAppliedFilter(filters, directoryFacets());

    // French has 3 nurses, Registered Nurse has 34.
    expect(suggestion?.label).toBe("French");
    expect(suggestion?.patch).toEqual({ languages: [], page: 1 });
  });

  it("drops only the narrowest value, keeping the family's other choices", () => {
    const filters = parseSearchParams({
      languages: "English,French",
      care_type: CareType.ELDERLY,
    });

    const suggestion = narrowestAppliedFilter(filters, directoryFacets());

    expect(suggestion?.label).toBe("French");
    expect(suggestion?.patch).toEqual({ languages: ["English"], page: 1 });
  });

  it("treats an applied option nobody is behind as the narrowest of all", () => {
    const filters = parseSearchParams({
      languages: "Russian,English",
      credential: Credential.HHA,
    });

    const suggestion = narrowestAppliedFilter(filters, directoryFacets());

    // Nobody speaks Russian, so it is the reason there are no results.
    expect(suggestion?.label).toBe("Russian");
    expect(suggestion?.patch).toEqual({ languages: ["English"], page: 1 });
  });

  it("names a scalar filter by its label, not its stored value", () => {
    const filters = parseSearchParams({
      credential: Credential.HHA,
      care_type: CareType.ELDERLY,
    });

    const suggestion = narrowestAppliedFilter(filters, directoryFacets());

    // Home Health Aide has 6 nurses, Elderly Care has 42.
    expect(suggestion?.label).toBe("Home Health Aide");
    expect(suggestion?.patch).toEqual({ credential: undefined, page: 1 });
  });

  it("says nothing when the counts could not be read", () => {
    const filters = parseSearchParams({
      languages: "French",
      credential: Credential.RN,
    });

    expect(narrowestAppliedFilter(filters, null)).toBeNull();
  });

  it("says nothing when the applied filters carry no counts at all", () => {
    // A zip and a rate have no option list behind them, so there is no
    // narrowest one to name.
    const filters = parseSearchParams({ zip: "11779", rate_max: "40" });

    expect(narrowestAppliedFilter(filters, directoryFacets())).toBeNull();
  });
});
