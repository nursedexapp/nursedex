import { describe, it, expect } from "vitest";
import { containsProfanity } from "@/lib/reviews/profanity";

describe("containsProfanity", () => {
  it("flags clearly profane text", () => {
    expect(containsProfanity("This is fucking unacceptable")).toBe(true);
    expect(containsProfanity("you asshole")).toBe(true);
  });

  it("does not flag clean text", () => {
    expect(containsProfanity("She was kind and patient with my mother.")).toBe(
      false,
    );
    expect(containsProfanity("Highly recommend!")).toBe(false);
  });

  it("does not flag medical/care vocab that contains substrings", () => {
    expect(containsProfanity("Provided assistance with daily tasks")).toBe(
      false,
    );
    expect(containsProfanity("Compassionate caregiver")).toBe(false);
    expect(containsProfanity("She helped with passage of medication")).toBe(
      false,
    );
    expect(containsProfanity("Worked the night shift")).toBe(false);
  });

  it("treats casing as case-insensitive", () => {
    expect(containsProfanity("FUCK this")).toBe(true);
    expect(containsProfanity("Fuck this")).toBe(true);
  });

  it("does not falsely flag empty or single-word neutral text", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("Wonderful")).toBe(false);
  });
});
