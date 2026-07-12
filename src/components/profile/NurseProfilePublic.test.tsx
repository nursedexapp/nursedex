// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NurseProfilePublic } from "./NurseProfilePublic";
import type { PublicNurseProfile } from "@/lib/profile/queries";

// The profile renders several client components; stub them so the server
// component renders cleanly under happy-dom.
vi.mock("@/components/reveals/RevealCTA", () => ({ RevealCTA: () => <div /> }));
vi.mock("@/components/hires/HireButton", () => ({ HireButton: () => <div /> }));
vi.mock("@/components/reviews/ReviewStateAction", () => ({
  ReviewStateAction: () => <div />,
}));
vi.mock("@/components/reviews/ReviewList", () => ({
  ReviewList: () => <div />,
}));
vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);

function makeNurse(
  overrides: Partial<PublicNurseProfile> = {},
): PublicNurseProfile {
  return {
    user_id: "11111111-1111-4111-8111-111111111111",
    first_name: "Jane",
    last_name: "Doe",
    slug: "jane-doe-rn",
    credential: "rn",
    license_number: "RN123456",
    care_types: ["adult"],
    primary_care_type: "adult",
    skills: [],
    gender: null,
    years_experience: null,
    languages: [],
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
    profile_completeness: 100,
    avg_rating: null,
    review_count: 0,
    has_photo: false,
    is_seed: false,
    zip_code: null,
    contact_email: null,
    contact_phone: null,
    communication_preference: null,
    ...overrides,
  };
}

describe("NurseProfilePublic identity gating", () => {
  it("masks the license number and last name when the viewer is not entitled", () => {
    // Mirrors the page: last_name blanked and license_number nulled upstream,
    // hasLicenseNumber preserved so the section still renders.
    render(
      <NurseProfilePublic
        nurse={makeNurse({ last_name: "", license_number: null })}
        photoUrl={null}
        licenseVerifyUrl="https://verify.example/license"
        distanceMiles={null}
        viewMode="free"
        revealMode="no_sub"
        canSeeIdentity={false}
        hasLicenseNumber
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Jane" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Jane Doe/)).not.toBeInTheDocument();

    expect(screen.getByText(/Unlocks with a subscription/)).toBeInTheDocument();
    expect(screen.queryByText("RN123456")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Verify this license on the NY State database/),
    ).not.toBeInTheDocument();
  });

  it("shows the full name, license number, and verify link when entitled", () => {
    render(
      <NurseProfilePublic
        nurse={makeNurse()}
        photoUrl={null}
        licenseVerifyUrl="https://verify.example/license"
        distanceMiles={null}
        viewMode="free"
        revealMode="subscribed"
        canSeeIdentity
        hasLicenseNumber
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Jane Doe" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RN123456")).toBeInTheDocument();
    expect(
      screen.getByText(/Verify this license on the NY State database/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Unlocks with a subscription/),
    ).not.toBeInTheDocument();
  });
});
