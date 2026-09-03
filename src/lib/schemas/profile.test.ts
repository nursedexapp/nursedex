import { describe, it, expect } from "vitest";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/schemas/profile";
import { NurseTier } from "@/types/enums";

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

  it("treats a whitespace-only license number as missing", () => {
    const schema = step2Schema(NurseTier.FREE);
    const result = schema.safeParse({
      credential: "cna",
      license_number: "   ",
      care_types: ["elderly"],
      primary_care_type: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("step3Schema", () => {
  it("accepts explicitly empty optional fields", () => {
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
    expect(result.success).toBe(true);
  });

  it("rejects rate_max less than rate_min", () => {
    const result = step3Schema.safeParse({
      rate_min: 50,
      rate_max: 30,
    });
    expect(result.success).toBe(false);
  });

  it("accepts equal rate_min and rate_max", () => {
    const result = step3Schema.safeParse({
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
