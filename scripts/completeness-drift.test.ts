import { describe, it, expect } from "vitest";
import {
  rowsNeedingRepair,
  summarise,
  parseReportedTotal,
} from "./completeness-drift";
import type { Skill, AvailabilityCommitment, TimeSlot } from "@/types/enums";

/**
 * The stored completeness score is what search ranks on, and it is written
 * only when a nurse saves the main profile form. Measured against production
 * on 2026-09-03, 42 of 106 verified profiles were scored BELOW what their
 * profile earns and none above, some by 40 to 65 points (#727).
 *
 * This finds them. The repair only ever moves a score to what the profile
 * already earns, so it cannot invent credit.
 */
const row = (stored: number, over: Partial<Record<string, unknown>> = {}) => ({
  user_id: `n-${stored}-${JSON.stringify(over)}`,
  profile_completeness: stored,
  photos: [] as string[],
  bio: null as string | null,
  skills: [] as Skill[],
  care_philosophy: null as string | null,
  availability_commitment: [] as AvailabilityCommitment[],
  time_slots: [] as TimeSlot[],
  rate_min: null as number | null,
  rate_max: null as number | null,
  has_transportation: false,
  covid_vaccinated: null as boolean | null,
  travel_radius_miles: null as number | null,
  ...over,
});

describe("rowsNeedingRepair", () => {
  it("leaves a row whose stored score already matches", () => {
    // An empty profile still earns the automatic credit for the credential
    // and language given at signup.
    const empty = row(0);
    const [repair] = rowsNeedingRepair([empty]);
    const stored = repair ? repair.derived : null;
    // Whatever the automatic floor is, a row already storing it needs nothing.
    expect(rowsNeedingRepair([row(stored ?? 0)])).toEqual([]);
  });

  it("finds a row scored below what its profile earns", () => {
    const withPhoto = row(0, { photos: ["a.jpg"] });
    const found = rowsNeedingRepair([withPhoto]);
    expect(found).toHaveLength(1);
    expect(found[0].derived).toBeGreaterThan(found[0].stored);
  });

  it("reports a row scored ABOVE what it earns rather than skipping it", () => {
    // This direction did not exist in the measured data, and it is the one
    // that matters most if it appears: a nurse ranked on credit she does not
    // have. Reporting it as its own thing keeps it from being read as more of
    // the same harmless undercount.
    const inflated = row(100);
    const found = rowsNeedingRepair([inflated]);
    expect(found).toHaveLength(1);
    expect(found[0].derived).toBeLessThan(found[0].stored);
  });
});

describe("summarise", () => {
  it("separates the two directions and counts them", () => {
    const text = summarise([
      { user_id: "a", stored: 0, derived: 10 },
      { user_id: "b", stored: 0, derived: 65 },
      { user_id: "c", stored: 100, derived: 40 },
    ]);
    expect(text).toContain("2 scored below");
    expect(text).toContain("1 scored above");
  });

  it("says plainly when there is no drift", () => {
    expect(summarise([])).toMatch(/no drift/i);
  });
});

describe("parseReportedTotal", () => {
  // The count is what tells a short read from a complete one, so an
  // unreadable count must not become a number. Every one of these would
  // otherwise land on the permissive side: NaN compares unequal to any row
  // count and would pass, and a missing header becoming 0 would make an empty
  // read look complete.
  it("reads the total out of a content-range header", () => {
    expect(parseReportedTotal("0-133/134")).toBe(134);
  });

  it("refuses a header that does not state a total", () => {
    expect(parseReportedTotal("0-133/*")).toBeNull();
  });

  it("refuses a missing header", () => {
    expect(parseReportedTotal(null)).toBeNull();
  });

  it("refuses a total that is not a number", () => {
    expect(parseReportedTotal("0-133/lots")).toBeNull();
  });
});
