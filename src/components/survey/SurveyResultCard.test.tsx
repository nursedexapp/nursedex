// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SurveyResultCard } from "./SurveyResultCard";
import type { NurseSearchCard } from "@/lib/nurses/card";

/**
 * #873. The sign-up prompt listed "photos" among the things you get by
 * creating an account, rendered directly beside the photograph it was already
 * showing. Photos are public on purpose: faces are what makes the directory
 * worth browsing. So the copy was the thing that was wrong.
 *
 * The trap in the other direction is worse and is guarded too: a free account
 * does NOT unlock a nurse's surname, which needs a subscription (#381). Copy
 * promising the full name would be a promise the product refuses to keep, and
 * it would be discovered only after somebody signed up.
 */
// Typed as the real thing, not cast through `unknown`: the first version of
// this fixture was missing half the fields and the cast hid it until the
// component threw on an absent array.
const nurse: NurseSearchCard = {
  user_id: "nurse-1",
  slug: "ada-l",
  first_name: "Ada",
  last_name: "",
  last_initial: "L",
  credential: "rn",
  primary_care_type: null,
  care_types: [],
  tier: "free",
  has_photo: true,
  photo_url: "https://example.test/ada.jpg",
  avg_rating: null,
  review_count: 0,
  is_available: true,
  unavailable_visibility: null,
  profile_completeness: 80,
  verified_at: null,
  zip_code: "11779",
  distance_miles: null,
  communication_preference: null,
  years_experience: 4,
  bio: null,
  rate_min: null,
  rate_max: null,
  availability_commitment: [],
  has_rate: false,
  has_availability: false,
  city: "Ronkonkoma",
  state: "NY",
};

afterEach(cleanup);

function openPrompt() {
  render(<SurveyResultCard nurse={nurse} signupHref="/signup?survey=1" />);
  fireEvent.click(screen.getByRole("button", { name: /see more of ada/i }));
}

describe("the survey sign-up prompt", () => {
  it("does not offer photos as something you unlock", () => {
    openPrompt();
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/photos/i);
  });

  it("does not promise the full name, which a free account does not give", () => {
    openPrompt();
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/full name|last name|surname/i);
  });

  it("still says what an account actually gives", () => {
    // Without this the test above is satisfied by an empty dialog, and the
    // prompt would have nothing to offer at all.
    openPrompt();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/full profile/i);
    expect(dialog).toHaveTextContent(/save/i);
  });
});
