import { describe, it, expect } from "vitest";
import {
  RANKING_CRITERIA,
  DISTANCE_RANKING_CRITERIA,
  rankNurses,
  type RankableNurse,
} from "./search-ranking";

function nurse(
  overrides: Partial<RankableNurse> & { user_id: string },
): RankableNurse & {
  user_id: string;
} {
  return {
    tier: "free",
    has_photo: false,
    communication_preference: null,
    review_count: 0,
    avg_rating: null,
    profile_completeness: 0,
    ...overrides,
  };
}

describe("rankNurses", () => {
  it("breaks full ties on ranking criteria deterministically by user_id", () => {
    // Two nurses identical on every ranking criterion, only their
    // user_id differs. Postgres makes no ordering guarantee without an
    // ORDER BY, so the raw query can return these in either order on
    // different executions of the same request. rankNurses must not
    // depend on input order for its output order (NURSEDEX-SITE-4).
    const a = nurse({ user_id: "b-nurse" });
    const b = nurse({ user_id: "a-nurse" });

    const rankedAB = rankNurses([a, b], null);
    const rankedBA = rankNurses([b, a], null);

    expect(rankedAB.map((n) => n.user_id)).toEqual(["a-nurse", "b-nurse"]);
    expect(rankedBA.map((n) => n.user_id)).toEqual(["a-nurse", "b-nurse"]);
  });
});

// A list of criteria maintained beside the tuple drifts from it silently, and
// the caption built from it then states an order the code does not use.
describe("RANKING_CRITERIA", () => {
  // Counting entries against the tuple's length no longer says anything: most
  // of the criteria are blended into one number now, so the tuple is shorter
  // than the list of things it weighs. What matters is that every criterion
  // the caption NAMES genuinely moves the order, which is asserted by
  // changing one attribute at a time and nothing else.
  const base = {
    tier: "free" as const,
    has_photo: false,
    communication_preference: null,
    review_count: 0,
    avg_rating: null,
    profile_completeness: 50,
  };
  const CRITERIA_EFFECTS = [
    { phrase: "featured nurses", better: { tier: "featured" as const } },
    { phrase: "more complete profiles", better: { profile_completeness: 90 } },
    { phrase: "more reviews", better: { review_count: 4 } },
    {
      phrase: "a higher rating",
      worse: { review_count: 2, avg_rating: 3 },
      better: { review_count: 2, avg_rating: 5 },
    },
    { phrase: "nurses with a photo", better: { has_photo: true } },
  ];

  it.each(CRITERIA_EFFECTS)("$phrase changes the order", (c) => {
    const worse = nurse({ user_id: "z-worse", ...base, ...(c.worse ?? {}) });
    const better = nurse({ user_id: "a-better", ...base, ...c.worse, ...c.better });
    const ranked = rankNurses([worse, better], null);
    expect(ranked[0].user_id).toBe("a-better");
  });

  it("names every criterion it uses, and no others", () => {
    const named = RANKING_CRITERIA.filter((c) => !c.conditional).map(
      (c) => c.phrase,
    );
    expect(named.sort()).toEqual(CRITERIA_EFFECTS.map((c) => c.phrase).sort());
  });

  it("names featured first, since nothing outranks it without a zip", () => {
    expect(RANKING_CRITERIA[0].phrase).toContain("featured");
  });

  it("marks the criterion that only applies to some viewers", () => {
    expect(RANKING_CRITERIA.filter((c) => c.conditional)).toHaveLength(1);
  });

  it("describes the zip order as closest first", () => {
    expect(DISTANCE_RANKING_CRITERIA[0].phrase).toContain("closest");
  });
});

// ── Ordering by distance ──────────────────────────────────────
//
// Decisions taken 2026-09-03, with the roster measured the same day: 60
// listed nurses across 52 zip codes, 25 of them in Suffolk County, and 8
// hundreds of miles from that core including one in North Carolina. With
// distance playing no part in the order, a family on Long Island was shown
// that nurse interleaved with nurses ten minutes away (#723).
//
//   A zip code means nearest first, full stop.
//   Featured placement is protected only within range: the family's own
//   radius, or 25 miles when they have not set one, which is the middle value
//   the filter already offers.
//   A nurse whose location cannot be worked out sorts below every nurse who
//   can be placed, rather than being treated as distance zero or dropped.
function placed(
  user_id: string,
  distance_miles: number | null,
  overrides: Partial<RankableNurse> = {},
) {
  return nurse({ user_id, distance_miles, ...overrides });
}

const nearestFirst = { originResolved: true, featuredRangeMiles: 25 };

describe("rankNurses when a family has entered a zip", () => {
  it("puts the nearest nurse first", () => {
    const ranked = rankNurses(
      [placed("far", 30), placed("near", 2), placed("middle", 11)],
      null,
      nearestFirst,
    );
    expect(ranked.map((n) => n.user_id)).toEqual(["near", "middle", "far"]);
  });

  it("sorts a nurse we cannot place below every nurse we can", () => {
    const ranked = rankNurses(
      [placed("unplaceable", null), placed("far", 90)],
      null,
      nearestFirst,
    );
    expect(ranked.map((n) => n.user_id)).toEqual(["far", "unplaceable"]);
  });

  it("does not treat a missing distance as being right here", () => {
    const ranked = rankNurses(
      [placed("unplaceable", null), placed("next-door", 1)],
      null,
      nearestFirst,
    );
    expect(ranked[0].user_id).toBe("next-door");
  });

  it("keeps a paying nurse on top when she is within range", () => {
    const ranked = rankNurses(
      [placed("free-closer", 3), placed("featured", 12, { tier: "featured" })],
      null,
      nearestFirst,
    );
    expect(ranked[0].user_id).toBe("featured");
  });

  it("gives a paying nurse no advantage once she is out of range", () => {
    // Otherwise a Buffalo nurse would sit above a local one for a Long Island
    // family, which is the complaint this work exists to answer.
    const ranked = rankNurses(
      [placed("free-local", 4), placed("featured-far", 300, { tier: "featured" })],
      null,
      nearestFirst,
    );
    expect(ranked.map((n) => n.user_id)).toEqual(["free-local", "featured-far"]);
  });

  it("uses the radius the family chose rather than the default", () => {
    const ranked = rankNurses(
      [placed("free-closer", 2), placed("featured", 40, { tier: "featured" })],
      null,
      { originResolved: true, featuredRangeMiles: 50 },
    );
    expect(ranked[0].user_id).toBe("featured");
  });

  it("orders two featured nurses in range by distance too", () => {
    const ranked = rankNurses(
      [
        placed("featured-far", 20, { tier: "featured" }),
        placed("featured-near", 5, { tier: "featured" }),
      ],
      null,
      nearestFirst,
    );
    expect(ranked.map((n) => n.user_id)).toEqual([
      "featured-near",
      "featured-far",
    ]);
  });
});

// ── Ordering with no zip ──────────────────────────────────────
//
// Completeness decides here, which is where #724 bites. It sat last in a
// strict left-to-right chain, so a single review was enough to make it never
// matter. It is now blended within the tier, so a large completeness
// advantage can outweigh a small review advantage while a big review record
// still wins.
describe("rankNurses when there is no zip to measure from", () => {
  it("puts a paying nurse first regardless", () => {
    const ranked = rankNurses(
      [
        nurse({ user_id: "free", profile_completeness: 100, review_count: 9 }),
        nurse({ user_id: "featured", tier: "featured" }),
      ],
      null,
    );
    expect(ranked[0].user_id).toBe("featured");
  });

  it("lets a much fuller profile beat a single review", () => {
    const ranked = rankNurses(
      [
        nurse({ user_id: "one-review", profile_completeness: 75, review_count: 1 }),
        nurse({ user_id: "complete", profile_completeness: 100 }),
      ],
      null,
    );
    expect(ranked[0].user_id).toBe("complete");
  });

  it("still lets a real review record win", () => {
    const ranked = rankNurses(
      [
        nurse({ user_id: "well-reviewed", profile_completeness: 85, review_count: 6, avg_rating: 5 }),
        nurse({ user_id: "complete", profile_completeness: 100 }),
      ],
      null,
    );
    expect(ranked[0].user_id).toBe("well-reviewed");
  });

  it("never lets a free nurse overtake a paying one on completeness", () => {
    const ranked = rankNurses(
      [
        nurse({ user_id: "free-perfect", profile_completeness: 100, review_count: 20, avg_rating: 5 }),
        nurse({ user_id: "featured-bare", tier: "featured", profile_completeness: 75 }),
      ],
      null,
    );
    expect(ranked[0].user_id).toBe("featured-bare");
  });
});
