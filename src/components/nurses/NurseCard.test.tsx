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
    last_initial: "D",
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
    verified_at: null,
    photo_focal_x: 50,
    photo_focal_y: 25,
    zip_code: null,
    distance_miles: null,
    communication_preference: null,
    years_experience: null,
    bio: null,
    rate_min: null,
    rate_max: null,
    availability_commitment: [],
    city: null,
    state: null,
    has_rate: false,
    has_availability: false,
    ...overrides,
  };
}

describe("NurseCard last name gating", () => {
  it("shows the first name and initial when showLastName is not set", () => {
    render(<NurseCard nurse={makeNurse()} />);
    expect(screen.getByText("Jane D.")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("shows the full name when showLastName is true", () => {
    render(<NurseCard nurse={makeNurse()} showLastName />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("keeps the last name hidden in anonymous mode even when showLastName is true", () => {
    render(<NurseCard nurse={makeNurse()} showLastName anonymousMode />);
    expect(screen.getByText("Jane D.")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("shows the first name only when the nurse has no last name on file", () => {
    render(
      <NurseCard
        nurse={makeNurse({ last_name: "", last_initial: "" })}
        showLastName
      />,
    );
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });
});

// Every field on this card is missing on some real nurse. Each absent state is
// designed, so each is asserted rather than left to whatever the layout does.
describe("NurseCard absent states", () => {
  it("shows the nurse's initial when there is no photo", () => {
    const { container } = render(<NurseCard nurse={makeNurse()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("draws no care type pill when the nurse has named none", () => {
    render(
      <NurseCard
        nurse={makeNurse({ primary_care_type: null, care_types: [] })}
      />,
    );
    expect(screen.queryByText(/care$/i)).not.toBeInTheDocument();
  });

  it("draws a care type pill when she has", () => {
    render(<NurseCard nurse={makeNurse({ primary_care_type: "elderly" })} />);
    expect(screen.getByText(/elderly/i)).toBeInTheDocument();
  });

  it("says the rate is not set rather than leaving a gap", () => {
    render(<NurseCard nurse={makeNurse()} />);
    expect(screen.getByText("Rate not set")).toBeInTheDocument();
  });

  it("says availability is not set rather than leaving a gap", () => {
    render(<NurseCard nurse={makeNurse()} />);
    expect(screen.getByText("Availability not set")).toBeInTheDocument();
  });

  it("omits the location line entirely when there is no town and no distance", () => {
    render(<NurseCard nurse={makeNurse()} />);
    expect(screen.queryByText(/Town not listed/)).not.toBeInTheDocument();
  });

  it("says the town is not listed when a distance is shown without one", () => {
    render(<NurseCard nurse={makeNurse({ distance_miles: 4 })} />);
    expect(screen.getByText(/Town not listed/)).toBeInTheDocument();
    expect(screen.getByText(/4 miles away/)).toBeInTheDocument();
  });

  it("drops the years from the credential line when there are none", () => {
    render(<NurseCard nurse={makeNurse({ years_experience: null })} />);
    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();
  });
});

describe("NurseCard content", () => {
  it("shows the town", () => {
    render(
      <NurseCard nurse={makeNurse({ city: "Ronkonkoma", state: "NY" })} />,
    );
    expect(screen.getByText(/Ronkonkoma, NY/)).toBeInTheDocument();
  });

  it("shows the bio", () => {
    render(<NurseCard nurse={makeNurse({ bio: "Twelve years on nights." })} />);
    expect(screen.getByText("Twelve years on nights.")).toBeInTheDocument();
  });

  it("shows the rate and the availability in the footer", () => {
    render(
      <NurseCard
        nurse={makeNurse({
          rate_min: 32,
          rate_max: 48,
          availability_commitment: ["part_time"],
          has_rate: true,
          has_availability: true,
        })}
      />,
    );
    expect(screen.getByText("$32 to $48 an hour")).toBeInTheDocument();
    expect(screen.getByText(/Part/i)).toBeInTheDocument();
  });

  // Decision D3: the mockup drops all three, the product keeps them.
  it("keeps the Featured, Unavailable and Revealed badges", () => {
    render(
      <NurseCard
        nurse={makeNurse({
          tier: "featured",
          is_available: false,
          revealed: true,
        })}
      />,
    );
    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Revealed")).toBeInTheDocument();
  });

  // SaveHeartButton needs the app router, which is not mounted here.
  // SaveHeartButton.test.tsx covers the button itself.
});

// The locked wording is derived from the nurse's record. A card that promises
// "log in to see rate and availability" for a nurse who has set neither sends a
// family to sign up and meet a blank.
describe("NurseCard locked footer", () => {
  function loggedOut(overrides: Partial<NurseSearchCard> = {}) {
    // What a logged out visitor's card actually looks like: the values are
    // blanked in the data, the has_ flags still describe the nurse.
    return makeNurse({
      rate_min: null,
      rate_max: null,
      availability_commitment: [],
      ...overrides,
    });
  }

  it("offers to unlock both when the nurse has set both", () => {
    render(
      <NurseCard
        nurse={loggedOut({ has_rate: true, has_availability: true })}
      />,
    );
    expect(
      screen.getByText("Log in to see rate and availability"),
    ).toBeInTheDocument();
  });

  it("offers only the rate when that is all she has set", () => {
    render(<NurseCard nurse={loggedOut({ has_rate: true })} />);
    expect(screen.getByText("Log in to see the rate")).toBeInTheDocument();
  });

  it("promises nothing when the nurse has set neither", () => {
    render(<NurseCard nurse={loggedOut()} />);
    expect(screen.queryByText(/Log in to see/)).not.toBeInTheDocument();
    expect(screen.getByText("Rate not set")).toBeInTheDocument();
  });
});

// The revealed page needs an "Access until" badge on the card. It used to be
// pinned to the top right corner, which on this card is where the rating sits.
describe("NurseCard extra badge", () => {
  it("renders it in the card's own badge row", () => {
    render(
      <NurseCard
        nurse={makeNurse({ avg_rating: 4.8, review_count: 6 })}
        extraBadge={<span>Access until Jul 1</span>}
      />,
    );
    expect(screen.getByText("Access until Jul 1")).toBeInTheDocument();
  });

  it("does not overlap the rating", () => {
    const { container } = render(
      <NurseCard
        nurse={makeNurse({ avg_rating: 4.8, review_count: 6 })}
        extraBadge={<span data-testid="access">Access until Jul 1</span>}
      />,
    );
    // Nothing on this card is absolutely positioned except the save heart,
    // which is not rendered here. An overlay would reintroduce the collision.
    const positioned = [...container.querySelectorAll("*")].filter((el) =>
      el.className?.toString().includes("absolute"),
    );
    expect(positioned).toHaveLength(0);
  });

  it("draws the badge row for it even when there is nothing else to show", () => {
    render(
      <NurseCard
        nurse={makeNurse({ primary_care_type: null, care_types: [] })}
        extraBadge={<span>Access until Jul 1</span>}
      />,
    );
    expect(screen.getByText("Access until Jul 1")).toBeVisible();
  });

  it("draws no badge row when there is nothing at all", () => {
    const { container } = render(
      <NurseCard
        nurse={makeNurse({ primary_care_type: null, care_types: [] })}
      />,
    );
    expect(container.textContent).not.toContain("Access until");
  });
});

describe("the card photo's framing", () => {
  // The card crops her photo to a small circle, so where that circle is taken
  // from decides whether her face is in it (#768).
  it("frames the photo where the nurse says her face is", () => {
    render(
      <NurseCard
        nurse={makeNurse({ photo_url: "/p.jpg", photo_focal_x: 20, photo_focal_y: 80 })}
      />,
    );
    const img = document.querySelector("img");
    expect(img).toHaveStyle({ objectPosition: "20% 80%" });
  });

  it("uses her own point rather than one fixed for everybody", () => {
    const { container: a } = render(
      <NurseCard nurse={makeNurse({ photo_url: "/p.jpg", photo_focal_x: 10, photo_focal_y: 10 })} />,
    );
    const { container: b } = render(
      <NurseCard nurse={makeNurse({ photo_url: "/p.jpg", photo_focal_x: 90, photo_focal_y: 90 })} />,
    );
    const posOf = (c: HTMLElement) =>
      (c.querySelector("img") as HTMLElement | null)?.style.objectPosition;
    expect(posOf(a)).not.toBe(posOf(b));
  });
});
