import { describe, it, expect } from "vitest";
import { calculateCompleteness } from "@/lib/profile/completeness";
import type { Skill, AvailabilityCommitment, TimeSlot } from "@/types/enums";

const EMPTY_PROFILE = {
  photos: [] as string[],
  bio: null,
  skills: [] as Skill[],
  care_philosophy: null,
  availability_commitment: [] as AvailabilityCommitment[],
  time_slots: [] as TimeSlot[],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  travel_radius_miles: null,
};

const FULL_PROFILE = {
  photos: ["photo1.jpg"],
  bio: "A great nurse with years of experience.",
  skills: ["medication_management", "vital_signs"] as Skill[],
  care_philosophy: "I treat every patient like family.",
  availability_commitment: ["full_time"] as AvailabilityCommitment[],
  time_slots: ["weekdays", "evenings"] as TimeSlot[],
  rate_min: 25,
  rate_max: 40,
  has_transportation: true,
  covid_vaccinated: true,
  travel_radius_miles: 25,
};

describe("calculateCompleteness", () => {
  it("starts at 10% for an empty profile (certs + languages credit automatically)", () => {
    const { score, missing } = calculateCompleteness(EMPTY_PROFILE);
    expect(score).toBe(10);
    expect(missing.length).toBe(10);
    expect(labelsOf(missing)).not.toContain(
      "List any additional certifications",
    );
    expect(labelsOf(missing)).not.toContain(
      "Add additional languages you speak",
    );
  });

  it("returns 100% for a fully complete profile", () => {
    const { score, missing } = calculateCompleteness(FULL_PROFILE);
    expect(score).toBe(100);
    expect(missing.length).toBe(0);
  });

  it("scores photo at 15 points (on top of 10 baseline)", () => {
    const { score } = calculateCompleteness({
      ...EMPTY_PROFILE,
      photos: ["photo.jpg"],
    });
    expect(score).toBe(25);
  });

  it("scores bio at 15 points (on top of 10 baseline)", () => {
    const { score } = calculateCompleteness({
      ...EMPTY_PROFILE,
      bio: "My bio text",
    });
    expect(score).toBe(25);
  });

  it("does not count empty/whitespace bio", () => {
    const { score } = calculateCompleteness({
      ...EMPTY_PROFILE,
      bio: "   ",
    });
    expect(score).toBe(10);
  });

  it("scores has_transportation only when true", () => {
    const { score: withoutTransport } = calculateCompleteness(EMPTY_PROFILE);
    const { score: withTransport } = calculateCompleteness({
      ...EMPTY_PROFILE,
      has_transportation: true,
    });
    expect(withTransport - withoutTransport).toBe(5);
  });

  it("scores covid_vaccinated when explicitly set (even false)", () => {
    const { score: unset } = calculateCompleteness(EMPTY_PROFILE);
    const { score: setFalse } = calculateCompleteness({
      ...EMPTY_PROFILE,
      covid_vaccinated: false,
    });
    expect(setFalse - unset).toBe(5);
  });

  it("scores rate when either min or max is set", () => {
    const { score: noRate } = calculateCompleteness(EMPTY_PROFILE);
    const { score: minOnly } = calculateCompleteness({
      ...EMPTY_PROFILE,
      rate_min: 20,
    });
    expect(minOnly - noRate).toBe(10);
  });

  it("lists correct missing items", () => {
    const { missing } = calculateCompleteness({
      ...FULL_PROFILE,
      photos: [],
      bio: null,
    });
    expect(labelsOf(missing)).toContain("Add a professional photo");
    expect(labelsOf(missing)).toContain("Write your bio");
    expect(missing.length).toBe(2);
  });
});

// #730: the missing list reads as housekeeping unless it says what each item
// is worth. Nurses were never told a fuller profile means a better position
// in search, and once completeness genuinely decides the order (#724) that is
// true and still unstated.
function labelsOf(missing: { label: string }[]): string[] {
  return missing.map((m) => m.label);
}

describe("what each missing item is worth", () => {
  it("says how many points each one earns", () => {
    const { missing } = calculateCompleteness({
      ...FULL_PROFILE,
      photos: [],
      bio: null,
    });
    const photo = missing.find((m) => m.label.includes("photo"));
    expect(photo?.points).toBe(15);
  });

  it("puts the biggest wins first, so the top of the list is worth reading", () => {
    const { missing } = calculateCompleteness(EMPTY_PROFILE);
    const points = missing.map((m) => m.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("adds up to what is missing from the score", () => {
    // Otherwise the list and the number beside it tell different stories.
    const { score, missing } = calculateCompleteness(EMPTY_PROFILE);
    const owed = missing.reduce((sum, m) => sum + m.points, 0);
    expect(score + owed).toBe(100);
  });
});
