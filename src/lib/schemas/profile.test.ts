import { describe, it, expect } from "vitest";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/schemas/profile";
import {
  NurseTier,
  Skill,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";

describe("step1Schema", () => {
  it("accepts valid data", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: 5,
      languages: ["English"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty first name", () => {
    const result = step1Schema.safeParse({
      first_name: "",
      last_name: "Doe",
      gender: "female",
      years_experience: 5,
      languages: ["English"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative years", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: -1,
      languages: ["English"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects years over 70", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: 71,
      languages: ["English"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty languages", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: 5,
      languages: [],
    });
    expect(result.success).toBe(false);
  });

  // #934. The form normalises too, but the schema is what every write goes
  // through, so the stored spelling cannot depend on which client sent it.
  it("title cases every word of a language on the way in", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: 5,
      languages: ["English", "haitian creole"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.languages).toEqual(["English", "Haitian Creole"]);
  });

  it("collapses two spellings of one language into one entry", () => {
    const result = step1Schema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      gender: "female",
      years_experience: 5,
      languages: ["Haitian creole", "haitian Creole"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.languages).toEqual(["Haitian Creole"]);
  });
});

describe("step2Schema", () => {
  it("free tier allows max 2 care types", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "123456",
      care_types: ["elderly", "pediatric", "hospice"],
      primary_care_type: "elderly",
    });
    expect(result.success).toBe(false);
  });

  it("free tier accepts 2 care types", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "123456",
      care_types: ["elderly", "pediatric"],
      primary_care_type: "elderly",
    });
    expect(result.success).toBe(true);
  });

  it("featured tier allows unlimited care types", () => {
    const schema = step2Schema(NurseTier.FEATURED);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "123456",
      care_types: [
        "elderly",
        "pediatric",
        "hospice",
        "memory_care",
        "wound_care",
      ],
      primary_care_type: "elderly",
    });
    expect(result.success).toBe(true);
  });

  it("requires primary care type when multiple selected", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "123456",
      care_types: ["elderly", "pediatric"],
      primary_care_type: null,
    });
    expect(result.success).toBe(false);
  });

  it("allows null primary when only one care type", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "123456",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(true);
  });

  it("requires a license number for non-HHA credentials", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "license_number"),
      ).toBe(true);
    }
  });

  it("allows HHAs to omit the license number", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "hha",
      license_number: "",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a license number from an HHA who has one", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "hha",
      license_number: "HHA-12345",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(true);
  });

  // CNAs are certified, not licensed, the same as HHAs (Dan, 2026-09-22).
  it("allows CNAs to omit the license number", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "cna",
      license_number: "",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(true);
  });

  it("treats a whitespace-only license number as missing", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "rn",
      license_number: "   ",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("step3Schema", () => {
  // The test that used to stand here asserted the opposite: that all three
  // lists could be left empty. That was the behaviour reversed in #905, so it
  // is deleted rather than adjusted. Leaving it would have made it the guard
  // defending the lockout.
  it("requires at least one skill, availability and time slot", () => {
    const result = step3Schema.safeParse({
      skills: [],
      availability_commitment: [],
      time_slots: [],
      rate_min: null,
      rate_max: null,
      has_transportation: false,
      covid_vaccinated: null,
      care_philosophy: null,
      additional_certs: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts one of each", () => {
    const result = step3Schema.safeParse({
      skills: [Skill.MEDICATION_MANAGEMENT],
      availability_commitment: [AvailabilityCommitment.PART_TIME],
      time_slots: [TimeSlot.WEEKDAYS],
      rate_min: null,
      rate_max: null,
      has_transportation: false,
      covid_vaccinated: null,
      care_philosophy: null,
      additional_certs: [],
    });
    expect(result.success).toBe(true);
  });

  // Both rate tests carry the required lists (#905). Without them the
  // rejection test would pass on the missing lists rather than on the rate
  // rule it names.
  const step3Required = {
    skills: [Skill.MEDICATION_MANAGEMENT],
    availability_commitment: [AvailabilityCommitment.PART_TIME],
    time_slots: [TimeSlot.WEEKDAYS],
  };

  it("rejects rate_max less than rate_min", () => {
    const result = step3Schema.safeParse({
      ...step3Required,
      rate_min: 50,
      rate_max: 30,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(JSON.stringify(result.error.issues)).toContain("rate");
  });

  it("accepts equal rate_min and rate_max", () => {
    const result = step3Schema.safeParse({
      ...step3Required,
      rate_min: 40,
      rate_max: 40,
    });
    expect(result.success).toBe(true);
  });
});

describe("step4Schema", () => {
  it("free tier limits bio to 150 chars", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "x".repeat(151),
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(false);
  });

  it("free tier allows 150 char bio", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "x".repeat(150),
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(true);
  });

  it("featured tier allows up to 500 char bio", () => {
    const schema = step4Schema(NurseTier.FEATURED);
    const result = schema.safeParse({
      bio: "x".repeat(500),
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(true);
  });

  // A bio of only whitespace passed min(1) and was stored. The directory
  // lists a nurse whose bio is not the empty string (#732), while
  // calculateCompleteness trims before crediting it, so such a nurse would
  // have been listed with a blank card and no credit for it. Trimming makes
  // the two rules agree on every value that can reach the database.
  it("rejects a bio of only whitespace", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "   ",
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(false);
  });

  it("stores a bio with its surrounding whitespace removed", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "  I love this work  ",
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bio).toBe("I love this work");
  });

  it("free tier limits to 1 photo", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "My bio",
      photos: ["a.jpg", "b.jpg"],
    });
    expect(result.success).toBe(false);
  });

  it("featured tier allows up to 3 photos", () => {
    const schema = step4Schema(NurseTier.FEATURED);
    const result = schema.safeParse({
      bio: "My bio",
      photos: ["a.jpg", "b.jpg", "c.jpg"],
    });
    expect(result.success).toBe(true);
  });
});

describe("step5Schema", () => {
  it("requires at least email or phone", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "",
      communication_preference: "email",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("accepts email only", () => {
    const result = step5Schema.safeParse({
      contact_email: "jane@example.com",
      contact_phone: "",
      communication_preference: "email",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(true);
  });

  it("accepts phone only", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "(631) 482-7193",
      communication_preference: "phone",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(true);
  });

  it("rejects phone with 555 prefix", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "(516) 555-1234",
      communication_preference: "phone",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone with sequential digits", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "5161234567",
      communication_preference: "phone",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone that is all the same digit", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "5555555555",
      communication_preference: "phone",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects partial phone number", () => {
    const result = step5Schema.safeParse({
      contact_email: "",
      contact_phone: "(631) 23",
      communication_preference: "phone",
      zip_code: "11701",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid zip code", () => {
    const result = step5Schema.safeParse({
      contact_email: "jane@example.com",
      communication_preference: "email",
      zip_code: "1170",
      travel_radius_miles: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects travel radius over 100", () => {
    const result = step5Schema.safeParse({
      contact_email: "jane@example.com",
      communication_preference: "email",
      zip_code: "11701",
      travel_radius_miles: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe("where her face is in the photo", () => {
  // Two percentages, saved with the rest of step 4 (#768). A value outside
  // the photo crops to nothing, and a form that never showed the picker must
  // still save rather than being refused for a field she was never asked.
  it("accepts a point on the photo", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "My bio",
      photos: ["photo-1.jpg"],
      photo_focal_x: 30,
      photo_focal_y: 70,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photo_focal_x).toBe(30);
      expect(result.data.photo_focal_y).toBe(70);
    }
  });

  it("refuses a point outside the photo", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "My bio",
      photos: ["photo-1.jpg"],
      photo_focal_x: 140,
      photo_focal_y: 50,
    });
    expect(result.success).toBe(false);
  });

  it("saves fine when the form never asked", () => {
    const schema = step4Schema(NurseTier.FREE);
    const result = schema.safeParse({
      bio: "My bio",
      photos: ["photo-1.jpg"],
    });
    expect(result.success).toBe(true);
  });
});
