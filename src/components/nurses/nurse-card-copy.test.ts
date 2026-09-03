import { describe, it, expect } from "vitest";
import {
  availabilityLabel,
  careTypeLabel,
  distanceLabel,
  credentialLine,
  displayName,
  lockedFooterLabel,
  rateLabel,
  townLabel,
} from "./nurse-card-copy";
import type { NurseSearchCard } from "@/lib/nurses/card";

function nurse(overrides: Partial<NurseSearchCard> = {}): NurseSearchCard {
  return {
    user_id: "nurse-1",
    slug: "jane-r",
    first_name: "Jane",
    last_name: "",
    last_initial: "R",
    credential: "rn",
    primary_care_type: "elderly",
    care_types: ["elderly"],
    tier: "free",
    has_photo: false,
    photo_url: null,
    avg_rating: null,
    review_count: 0,
    is_available: true,
    unavailable_visibility: null,
    profile_completeness: 50,
    zip_code: "11779",
    distance_miles: null,
    communication_preference: null,
    years_experience: 7,
    bio: null,
    rate_min: 32,
    rate_max: 48,
    availability_commitment: ["part_time"],
    has_rate: true,
    has_availability: true,
    city: "Ronkonkoma",
    state: "NY",
    ...overrides,
  };
}

describe("rateLabel", () => {
  it("reads as a range when both ends are set", () => {
    expect(rateLabel(nurse())).toBe("$32 to $48 an hour");
  });

  it("reads as one figure when both ends match", () => {
    expect(rateLabel(nurse({ rate_min: 40, rate_max: 40 }))).toBe(
      "$40 an hour",
    );
  });

  it("says From when only a floor is set", () => {
    expect(rateLabel(nurse({ rate_max: null }))).toBe("From $32 an hour");
  });

  it("says Up to when only a ceiling is set", () => {
    expect(rateLabel(nurse({ rate_min: null }))).toBe("Up to $48 an hour");
  });

  // Designed absent state, not a collapsed one.
  it("says the rate is not set when the nurse has set none", () => {
    expect(rateLabel(nurse({ rate_min: null, rate_max: null }))).toBe(
      "Rate not set",
    );
  });

  it("keeps the cents on a rate that has them", () => {
    expect(rateLabel(nurse({ rate_min: 32.5, rate_max: 32.5 }))).toBe(
      "$32.50 an hour",
    );
  });
});

describe("availabilityLabel", () => {
  it("lists what the nurse committed to, in words", () => {
    expect(
      availabilityLabel(
        nurse({ availability_commitment: ["part_time", "overnight"] }),
      ),
    ).toMatch(/,/);
  });

  it("says availability is not set when there is none", () => {
    expect(availabilityLabel(nurse({ availability_commitment: [] }))).toBe(
      "Availability not set",
    );
  });
});

describe("lockedFooterLabel", () => {
  // The whole point: the wording is derived from the nurse's record. A card
  // that promises a rate for a nurse who has set none sends a family to sign
  // up and meet a blank.
  it("promises nothing when the nurse has set neither", () => {
    expect(
      lockedFooterLabel(nurse({ has_rate: false, has_availability: false })),
    ).toBeNull();
  });

  it("names both when the nurse has set both", () => {
    expect(lockedFooterLabel(nurse())).toBe(
      "Log in to see rate and availability",
    );
  });

  it("names only the rate when that is all she has set", () => {
    expect(lockedFooterLabel(nurse({ has_availability: false }))).toBe(
      "Log in to see the rate",
    );
  });

  it("names only availability when that is all she has set", () => {
    expect(lockedFooterLabel(nurse({ has_rate: false }))).toBe(
      "Log in to see availability",
    );
  });
});

describe("credentialLine", () => {
  it("carries the credential and the years", () => {
    expect(credentialLine(nurse())).toContain("7 years");
  });

  it("says one year rather than one years", () => {
    expect(credentialLine(nurse({ years_experience: 1 }))).toContain("1 year");
    expect(credentialLine(nurse({ years_experience: 1 }))).not.toContain(
      "1 years",
    );
  });

  it("drops the years entirely when there are none on file", () => {
    const line = credentialLine(nurse({ years_experience: null }));
    expect(line).not.toContain("year");
    expect(line.length).toBeGreaterThan(0);
  });
});

describe("careTypeLabel", () => {
  it("prefers the primary care type", () => {
    expect(
      careTypeLabel(nurse({ primary_care_type: "elderly" })),
    ).not.toBeNull();
  });

  it("falls back to the first care type listed", () => {
    expect(
      careTypeLabel(
        nurse({ primary_care_type: null, care_types: ["pediatric"] }),
      ),
    ).not.toBeNull();
  });

  it("is null when the nurse has named none, so no empty pill is drawn", () => {
    expect(
      careTypeLabel(nurse({ primary_care_type: null, care_types: [] })),
    ).toBeNull();
  });
});

describe("townLabel", () => {
  it("joins town and state", () => {
    expect(townLabel(nurse())).toBe("Ronkonkoma, NY");
  });

  it("is null when the zip could not be placed", () => {
    expect(townLabel(nurse({ city: null, state: null }))).toBeNull();
  });

  it("shows the town alone rather than a trailing comma", () => {
    expect(townLabel(nurse({ state: null }))).toBe("Ronkonkoma");
  });
});

describe("displayName", () => {
  it("is first name plus initial for a viewer without identity", () => {
    expect(displayName(nurse(), { showLastName: false })).toBe("Jane R.");
  });

  it("is the full name for an entitled viewer", () => {
    expect(
      displayName(nurse({ last_name: "Rodriguez" }), { showLastName: true }),
    ).toBe("Jane Rodriguez");
  });

  // An entitled viewer whose card carries no surname (the nurse has none on
  // file) must not render a dangling space.
  it("falls back to the initial when there is no surname to show", () => {
    expect(displayName(nurse(), { showLastName: true })).toBe("Jane R.");
  });

  it("is the first name alone when there is no surname at all", () => {
    expect(
      displayName(nurse({ last_initial: "" }), { showLastName: false }),
    ).toBe("Jane");
  });
});

describe("distanceLabel", () => {
  it("says nothing when there is no distance", () => {
    expect(distanceLabel(nurse({ distance_miles: null }))).toBeNull();
  });

  it("says one mile rather than one miles", () => {
    expect(distanceLabel(nurse({ distance_miles: 1 }))).toBe("1 mile away");
  });

  it("counts miles", () => {
    expect(distanceLabel(nurse({ distance_miles: 17 }))).toBe("17 miles away");
  });

  // The distance is rounded, so zero means under half a mile, not exactly
  // here. "0 miles away" states something untrue and reads as a bug.
  it("does not say zero miles", () => {
    expect(distanceLabel(nurse({ distance_miles: 0 }))).toBe(
      "Less than a mile away",
    );
  });
});

describe("distanceLabel when a zip was given", () => {
  // A card with no distance means two different things, and they must not
  // read the same. Either the family gave no zip, so nothing was measured and
  // the card should say nothing, or she genuinely cannot be placed, which is
  // the case for the three nurses on the roster whose zip is outside New York
  // and so is not in the lookup table at all (#723).
  it("says the location is not on file when she cannot be placed", () => {
    expect(
      distanceLabel(nurse({ distance_miles: null }), { measured: true }),
    ).toMatch(/not on file/i);
  });

  it("says nothing when no zip was given to measure from", () => {
    expect(
      distanceLabel(nurse({ distance_miles: null }), { measured: false }),
    ).toBeNull();
  });

  it("still states a real distance", () => {
    expect(
      distanceLabel(nurse({ distance_miles: 4 }), { measured: true }),
    ).toBe("4 miles away");
  });
});
