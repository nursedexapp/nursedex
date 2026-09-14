import { describe, it, expect } from "vitest";
import { orderSentence, resultsSummary } from "./results-summary-copy";
import type { SearchResult } from "@/lib/nurses/search";
import type { NurseSearchCard } from "@/lib/nurses/card";

function card(id: string): NurseSearchCard {
  return {
    user_id: id,
    slug: id,
    first_name: "Jane",
    last_name: "",
    last_initial: "R",
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
    profile_completeness: 0,
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
    has_rate: false,
    has_availability: false,
    city: null,
    state: null,
  };
}

function result(
  items: number,
  totalFull: number,
  partials = 0,
  orderedByDistance = false,
  sortChoice: SearchResult["sort"] = "best",
): SearchResult {
  return {
    orderedByDistance,
    sort: sortChoice,
    items: Array.from({ length: items }, (_, i) => card(`i${i}`)),
    partials: Array.from({ length: partials }, (_, i) => card(`p${i}`)),
    totalFull,
    page: 1,
    totalPages: 1,
    hitResultCap: false,
    unlocatableZip: null,
  };
}

describe("the results headline", () => {
  // Each sentence is its own line, so the headline and the order caption do
  // not run together as one unpunctuated string on screen.
  it("is a finished sentence", () => {
    expect(resultsSummary(result(15, 98)).headline).toMatch(/\.$/);
    expect(resultsSummary(result(0, 0)).headline).toMatch(/\.$/);
  });

  it("says how many matched when they all fit on the page", () => {
    expect(resultsSummary(result(3, 3)).headline).toBe("3 nurses found.");
  });

  it("says one nurse rather than one nurses", () => {
    expect(resultsSummary(result(1, 1)).headline).toBe("1 nurse found.");
  });

  it("says which slice is on screen when there are more pages", () => {
    expect(resultsSummary(result(12, 40)).headline).toBe(
      "Showing 12 of 40 nurses.",
    );
  });

  it("says nothing matched when nothing did", () => {
    expect(resultsSummary(result(0, 0)).headline).toBe(
      "No nurses match your filters yet.",
    );
  });

  // Both numbers come from ONE predicate. The grid also renders partials, so
  // counting them into the shown number against a total of full matches can
  // read "Showing 12 of 3".
  it("never counts partials into either number", () => {
    const summary = resultsSummary(result(3, 3, 9));
    expect(summary.headline).toBe("3 nurses found.");
    expect(summary.headline).not.toContain("12");
  });

  it("cannot say it is showing more than the total", () => {
    for (const [shown, total, partials] of [
      [3, 3, 9],
      [12, 40, 0],
      [1, 1, 5],
      [0, 0, 6],
    ]) {
      const headline = resultsSummary(result(shown, total, partials)).headline;
      const numbers = (headline.match(/\d+/g) ?? []).map(Number);
      if (numbers.length === 2) {
        expect(numbers[0]).toBeLessThanOrEqual(numbers[1]);
      }
    }
  });
});

describe("the partials line", () => {
  it("counts them separately, in their own sentence", () => {
    expect(resultsSummary(result(3, 3, 9)).partials).toBe(
      "Plus 9 nurses who match some of your filters, below.",
    );
  });

  it("is absent when there are none", () => {
    expect(resultsSummary(result(3, 3)).partials).toBeNull();
  });
});

describe("the order caption", () => {
  // The mockup's caption was "Most complete profiles first", which was a claim
  // about an order the code did not use. Completeness genuinely is the second
  // criterion now, so the caption may name it, but it still must not be
  // described as what comes first.
  it("names what actually comes first with no zip", () => {
    expect(orderSentence(false)).toMatch(/^Featured nurses first/);
  });

  // #966: this asserted "The closest nurses first", which is not the order the
  // code runs. Featured within the paid radius has led the zip order since
  // #723, so a family told the closest come first could be shown a nurse 20
  // miles away above one 2 miles away. The ranking is the paid product working
  // as sold; the sentence was the untrue half.
  it("names what actually comes first once a zip is placed", () => {
    expect(orderSentence(true)).toMatch(/^Featured nurses near you first/);
  });

  it("still tells a family that distance decides the rest", () => {
    expect(orderSentence(true)).toContain("closest");
  });

  it("never says completeness comes first", () => {
    expect(orderSentence(false)).not.toMatch(/^Most complete/i);
    expect(orderSentence(true)).not.toMatch(/^Most complete/i);
  });

  it("claims nothing that only applies to some viewers", () => {
    expect(orderSentence(false)).not.toContain("contacted");
    expect(orderSentence(true)).not.toContain("contacted");
  });
});

describe("the caption when the family chose a sort", () => {
  // A caption that kept describing the default order while she is looking at
  // her own chosen one would be describing an order that is not on screen.
  it("names the sort she chose", () => {
    expect(resultsSummary(result(15, 98, 0, true, "rating")).order).toMatch(
      /highest rated first/i,
    );
  });

  it("names closest when that is what she chose", () => {
    expect(resultsSummary(result(15, 98, 0, true, "closest")).order).toMatch(
      /closest first/i,
    );
  });

  it("goes back to describing the ranking on best match", () => {
    expect(resultsSummary(result(15, 98, 0, false, "best")).order).toMatch(
      /^Featured nurses first/,
    );
  });
});
