// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResultsSummary } from "./ResultsSummary";
import type { SearchResult } from "@/lib/nurses/search";
import type { NurseSearchCard } from "@/lib/nurses/card";

afterEach(cleanup);

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
    orderedByDistance: false,
  };
}

describe("ResultsSummary", () => {
  // The defect this exists for, seen on the rendered page: the headline and
  // the order caption ran together as one unpunctuated string.
  it("puts each sentence in its own paragraph", () => {
    const { container } = render(<ResultsSummary result={result(15, 98, 4)} />);
    const lines = [...container.querySelectorAll("p")].map((p) =>
      p.textContent?.trim(),
    );
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toMatch(/\.$/);
    }
  });

  it("shows the count and the order", () => {
    render(<ResultsSummary result={result(15, 98)} />);
    expect(screen.getByText(/Showing 15 of 98 nurses\./)).toBeInTheDocument();
    expect(screen.getByText(/^Featured nurses first/)).toBeInTheDocument();
  });

  it("drops the order line when there is only one nurse", () => {
    const { container } = render(<ResultsSummary result={result(1, 1)} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("counts partials in their own line, never in the headline", () => {
    render(<ResultsSummary result={result(3, 3, 9)} />);
    expect(screen.getByText("3 nurses found.")).toBeInTheDocument();
    expect(screen.getByText(/Plus 9 nurses/)).toBeInTheDocument();
  });

  it("says nothing matched, without an order or a partials line", () => {
    const { container } = render(<ResultsSummary result={result(0, 0)} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(
      screen.getByText("No nurses match your filters yet."),
    ).toBeInTheDocument();
  });
});
