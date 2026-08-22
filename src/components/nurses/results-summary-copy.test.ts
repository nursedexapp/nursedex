import { describe, it, expect } from "vitest";
import { ORDER_SENTENCE, resultsSummary } from "./results-summary-copy";
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

function result(items: number, totalFull: number, partials = 0): SearchResult {
  return {
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
  // The mockup's caption was "Most complete profiles first". Completeness is
  // the LAST criterion, consulted only on an exact tie of everything above it.
  it("does not claim completeness drives the order", () => {
    expect(ORDER_SENTENCE.toLowerCase()).not.toContain("complete");
  });

  it("names what actually comes first", () => {
    expect(ORDER_SENTENCE).toMatch(/^Featured nurses first/);
  });

  it("claims nothing that only applies to some viewers", () => {
    expect(ORDER_SENTENCE).not.toContain("contacted");
  });

  it("is left off when there is nothing to order", () => {
    expect(resultsSummary(result(1, 1)).order).toBeNull();
    expect(resultsSummary(result(0, 0)).order).toBeNull();
  });

  it("is shown once there is more than one nurse", () => {
    expect(resultsSummary(result(2, 2)).order).toBe(ORDER_SENTENCE);
  });
});
