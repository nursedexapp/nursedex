// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildPreviewViews } from "./preview";
import type { PublicNurseProfile } from "./queries";
import type { User } from "@/types/database";

/**
 * #447. The preview told nurses "this is how families will see your profile"
 * while rendering a view no family ever gets: the real licence number, the
 * full surname, and no contact gating at all. A nurse could reasonably
 * conclude their licence number is public.
 *
 * These two views are what families actually get, built from the same record
 * so they cannot drift from each other.
 */
const nurse = {
  user_id: "nurse-1",
  first_name: "Ada",
  last_name: "Lovelace",
  slug: "ada-lovelace",
  credential: "rn",
  license_number: "RN123456",
  care_types: [],
  primary_care_type: null,
  skills: [],
  gender: null,
  years_experience: 5,
  languages: ["English"],
  bio: null,
  photos: [],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  care_philosophy: null,
  additional_certs: [],
  availability_commitment: [],
  time_slots: [],
  travel_radius_miles: null,
  tier: "free",
  verification_status: "verified",
  is_available: true,
  unavailable_visibility: null,
  profile_completeness: 80,
  avg_rating: null,
  review_count: 0,
  has_photo: false,
  is_seed: false,
  zip_code: "11779",
  contact_email: null,
  contact_phone: null,
  communication_preference: null,
} satisfies PublicNurseProfile;

const user = {
  email: "ada@example.com",
  phone: "555-0100",
  communication_preference: "email",
} as User;

describe("buildPreviewViews", () => {
  it("hides the surname and licence number from a signed-out visitor", () => {
    const { visitor } = buildPreviewViews(nurse, user);
    expect(visitor.last_name).toBe("");
    expect(visitor.license_number).toBeNull();
  });

  it("gives the visitor no contact details", () => {
    const { visitor } = buildPreviewViews(nurse, user);
    expect(visitor.contact_email).toBeNull();
    expect(visitor.contact_phone).toBeNull();
  });

  it("shows a subscribed family the surname and the contact details", () => {
    const { subscribed } = buildPreviewViews(nurse, user);
    expect(subscribed.last_name).toBe("Lovelace");
    expect(subscribed.contact_email).toBe("ada@example.com");
    expect(subscribed.contact_phone).toBe("555-0100");
  });

  it("reports that a licence is on file, without revealing it", () => {
    // The visitor view still says "a licence exists, subscribe to see it", so
    // the flag has to be captured before the value is removed.
    const { hasLicenseNumber, visitor } = buildPreviewViews(nurse, user);
    expect(hasLicenseNumber).toBe(true);
    expect(visitor.license_number).toBeNull();
  });

  it("does not damage the record it was given", () => {
    // redactNurseIdentity edits IN PLACE. Handing it the caller's object would
    // blank the surname for BOTH views, and the subscribed one would silently
    // become a second copy of the visitor one.
    const source = { ...nurse };
    buildPreviewViews(source, user);
    expect(source.last_name).toBe("Lovelace");
    expect(source.license_number).toBe("RN123456");
  });

  it("keeps the two views independent of each other", () => {
    const { visitor, subscribed } = buildPreviewViews(nurse, user);
    expect(visitor.last_name).not.toBe(subscribed.last_name);
  });

  it("says no licence is on file when there is none", () => {
    const { hasLicenseNumber } = buildPreviewViews(
      { ...nurse, license_number: null },
      user,
    );
    expect(hasLicenseNumber).toBe(false);
  });
});
