// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NurseCard } from "./NurseCard";
import type { NurseSearchCard } from "@/lib/nurses/card";

afterEach(cleanup);

function makeNurse(overrides: Partial<NurseSearchCard> = {}): NurseSearchCard {
  return {
    user_id: "11111111-1111-4111-8111-111111111111",
    slug: "jane-doe-rn",
    first_name: "Jane",
    last_name: "Doe",
    credential: "rn",
    primary_care_type: null,
    care_types: [],
    tier: "free",
    has_photo: false,
    photo_url: null,
    avg_rating: null,
    review_count: 0,
    is_available: true,
    unavailable_visibility: null,
    profile_completeness: 100,
    zip_code: null,
    distance_miles: null,
    communication_preference: null,
    years_experience: null,
    ...overrides,
  };
}

describe("NurseCard last name gating", () => {
  it("shows the first name only when showLastName is not set", () => {
    render(<NurseCard nurse={makeNurse()} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("shows the full name when showLastName is true", () => {
    render(<NurseCard nurse={makeNurse()} showLastName />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("keeps the last name hidden in anonymous mode even when showLastName is true", () => {
    render(<NurseCard nurse={makeNurse()} showLastName anonymousMode />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("shows the first name only when the nurse has no last name on file", () => {
    render(<NurseCard nurse={makeNurse({ last_name: "" })} showLastName />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });
});
