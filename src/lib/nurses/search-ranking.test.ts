import { describe, it, expect } from "vitest";
import {
  RANKING_CRITERIA,
  DISTANCE_RANKING_CRITERIA,
  DEFAULT_FEATURED_RANGE_MILES,
  rankNurses,
  orderNurses,
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

  // Two now: the contact preference match, and the name match a keyword
  // search adds (#936). Both are absent for most viewers, so a sentence built
  // for everyone may use neither.
  it("marks the criteria that only apply to some viewers", () => {
    expect(RANKING_CRITERIA.filter((c) => c.conditional)).toHaveLength(2);
  });

  // #966: this used to assert "closest" at index 0, which is what the copy
  // said and not what the code did. A Featured nurse anywhere inside the paid
  // radius has outranked a closer free one since #723, and that is the paid
  // placement working: /pricing sells Featured on "Top placement in search
  // results". So the copy was the wrong half and it moved.
  //
  // Asserting the ORDER RUN rather than the phrase at index 0 is what keeps
  // the two from drifting apart again: a literal can be edited to match a
  // sentence somebody liked, but this fails unless the ranking really does
  // put the criterion the caption names first (L63).
  it("names first, in the zip order, whatever the ranking actually puts first", () => {
    const nearby = nurse({ user_id: "free-2-miles", distance_miles: 2 });
    const featuredFurther = nurse({
      user_id: "featured-20-miles",
      tier: "featured",
      distance_miles: 20,
    });

    const ranked = rankNurses([nearby, featuredFurther], null, {
      originResolved: true,
      featuredRangeMiles: DEFAULT_FEATURED_RANGE_MILES,
    });

    expect(ranked[0].user_id).toBe("featured-20-miles");
    expect(DISTANCE_RANKING_CRITERIA[0].phrase).toContain("featured");
  });

  it("still names distance, which decides everything Featured does not", () => {
    const phrases = DISTANCE_RANKING_CRITERIA.map((c) => c.phrase).join(" ");
    expect(phrases).toContain("closest");
  });

  it("keeps the paid placement inside its radius, so near you means near you", () => {
    const nearby = nurse({ user_id: "free-2-miles", distance_miles: 2 });
    const featuredFarAway = nurse({
      user_id: "featured-300-miles",
      tier: "featured",
      distance_miles: 300,
    });

    const ranked = rankNurses([featuredFarAway, nearby], null, {
      originResolved: true,
      featuredRangeMiles: DEFAULT_FEATURED_RANGE_MILES,
    });

    expect(ranked[0].user_id).toBe("free-2-miles");
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

// ── An explicitly chosen sort (#725) ──────────────────────────
//
// Best match stays the default, so the paid Featured placement is what a
// family sees unless she deliberately chooses otherwise. Once she does
// choose, her choice wins outright: an order that quietly kept putting
// Featured first would not be the order she asked for.
function sortable(user_id: string, over: Partial<RankableNurse> = {}) {
  return nurse({ user_id, ...over });
}

describe("orderNurses with a chosen sort", () => {
  it("puts the closest first when she asks for closest", () => {
    const ranked = orderNurses(
      [
        sortable("far", { distance_miles: 40 }),
        sortable("near", { distance_miles: 2, profile_completeness: 0 }),
      ],
      null,
      { sort: "closest", distance: nearestFirst },
    );
    expect(ranked[0].user_id).toBe("near");
  });

  it("does not let a paying nurse override the order she chose", () => {
    const ranked = orderNurses(
      [
        sortable("featured-far", { tier: "featured", distance_miles: 20 }),
        sortable("free-near", { distance_miles: 1 }),
      ],
      null,
      { sort: "closest", distance: nearestFirst },
    );
    expect(ranked[0].user_id).toBe("free-near");
  });

  it("puts a nurse it cannot place last under closest", () => {
    const ranked = orderNurses(
      [sortable("unplaceable"), sortable("far", { distance_miles: 200 })],
      null,
      { sort: "closest", distance: nearestFirst },
    );
    expect(ranked.map((n) => n.user_id)).toEqual(["far", "unplaceable"]);
  });

  it("puts the highest rated first when she asks for rating", () => {
    const ranked = orderNurses(
      [
        sortable("ok", { review_count: 9, avg_rating: 3.5 }),
        sortable("great", { review_count: 2, avg_rating: 5 }),
      ],
      null,
      { sort: "rating" },
    );
    expect(ranked[0].user_id).toBe("great");
  });

  it("puts an unrated nurse below a rated one", () => {
    const ranked = orderNurses(
      [sortable("unrated"), sortable("rated", { review_count: 1, avg_rating: 1 })],
      null,
      { sort: "rating" },
    );
    expect(ranked.map((n) => n.user_id)).toEqual(["rated", "unrated"]);
  });

  it("puts the fullest profile first when she asks for that", () => {
    const ranked = orderNurses(
      [
        sortable("thin", { profile_completeness: 40, tier: "featured" }),
        sortable("full", { profile_completeness: 95 }),
      ],
      null,
      { sort: "complete" },
    );
    expect(ranked[0].user_id).toBe("full");
  });

  it("puts the most recently verified first when she asks for newest", () => {
    const ranked = orderNurses(
      [
        sortable("older", { verified_at: "2026-01-01T00:00:00.000Z" }),
        sortable("newer", { verified_at: "2026-08-01T00:00:00.000Z" }),
      ],
      null,
      { sort: "newest" },
    );
    expect(ranked[0].user_id).toBe("newer");
  });

  it("falls back to the ranking for best match", () => {
    const ranked = orderNurses(
      [sortable("free", { profile_completeness: 100 }), sortable("paid", { tier: "featured" })],
      null,
      { sort: "best" },
    );
    expect(ranked[0].user_id).toBe("paid");
  });

  it("orders ties the same way every time", () => {
    // Two nurses identical on the chosen sort. Without a deterministic
    // tie-break the page can render them in one order and re-render in
    // another (NURSEDEX-SITE-4).
    const a = sortable("b-nurse", { profile_completeness: 50 });
    const b = sortable("a-nurse", { profile_completeness: 50 });
    expect(
      orderNurses([a, b], null, { sort: "complete" }).map((n) => n.user_id),
    ).toEqual(["a-nurse", "b-nurse"]);
    expect(
      orderNurses([b, a], null, { sort: "complete" }).map((n) => n.user_id),
    ).toEqual(["a-nurse", "b-nurse"]);
  });
});

/**
 * A family who was given a nurse's name and types it should find that nurse
 * (#936). A keyword used to narrow the result set without reordering it, so
 * the nurse she named could sit below people whose bio happened to contain
 * the same string.
 *
 * Dan's call, 2026-09-04: paid Featured placement is absolute. A name match
 * ranks above every other signal EXCEPT Featured, which is never pushed down.
 */
describe("ranking a nurse the family named", () => {
  it("puts a name match above a nurse matched only on her bio text", () => {
    const named = nurse({ user_id: "zz-named", name_match: true });
    const textOnly = nurse({ user_id: "aa-text", name_match: false });

    expect(rankNurses([textOnly, named], null).map((n) => n.user_id)).toEqual([
      "zz-named",
      "aa-text",
    ]);
  });

  // The decision. A Featured nurse is never pushed below anything.
  it("leaves a Featured nurse above a name match", () => {
    const named = nurse({ user_id: "zz-named", name_match: true });
    const featured = nurse({ user_id: "aa-featured", tier: "featured" });

    expect(rankNurses([named, featured], null).map((n) => n.user_id)).toEqual([
      "aa-featured",
      "zz-named",
    ]);
  });

  it("still separates two Featured nurses by whether one was named", () => {
    const namedFeatured = nurse({
      user_id: "zz-named",
      tier: "featured",
      name_match: true,
    });
    const otherFeatured = nurse({ user_id: "aa-other", tier: "featured" });

    expect(
      rankNurses([otherFeatured, namedFeatured], null).map((n) => n.user_id),
    ).toEqual(["zz-named", "aa-other"]);
  });

  // A name is an identification, not a preference, so it outranks the signals
  // that stand in for one.
  it("puts a name match above a photo, a contact match and a fuller profile", () => {
    const named = nurse({ user_id: "zz-named", name_match: true });
    const polished = nurse({
      user_id: "aa-polished",
      has_photo: true,
      communication_preference: "email",
      profile_completeness: 100,
      review_count: 20,
      avg_rating: 5,
    });

    expect(
      rankNurses([polished, named], "email").map((n) => n.user_id),
    ).toEqual(["zz-named", "aa-polished"]);
  });

  it("changes nothing when no search keyword was given", () => {
    const a = nurse({ user_id: "a", has_photo: true });
    const b = nurse({ user_id: "b" });

    // No card carries name_match at all, which is every search without a
    // keyword and every listing page.
    expect(rankNurses([b, a], null).map((n) => n.user_id)).toEqual(["a", "b"]);
  });

  describe("when the family also gave a zip", () => {
    const ctx = { originResolved: true, featuredRangeMiles: 25 };

    it("puts the nurse she named above closer nurses she did not", () => {
      const named = nurse({
        user_id: "zz-named",
        name_match: true,
        distance_miles: 40,
      });
      const near = nurse({ user_id: "aa-near", distance_miles: 2 });

      expect(
        rankNurses([near, named], null, ctx).map((n) => n.user_id),
      ).toEqual(["zz-named", "aa-near"]);
    });

    it("still leaves a Featured nurse in range on top", () => {
      const named = nurse({
        user_id: "zz-named",
        name_match: true,
        distance_miles: 40,
      });
      const featured = nurse({
        user_id: "aa-featured",
        tier: "featured",
        distance_miles: 5,
      });

      expect(
        rankNurses([named, featured], null, ctx).map((n) => n.user_id),
      ).toEqual(["aa-featured", "zz-named"]);
    });

    // A Featured nurse outside the paid range does not hold the top slot, and
    // that rule is unchanged: the name match now sits above her too.
    it("puts a name match above a Featured nurse who is out of range", () => {
      // The Featured nurse is CLOSER, so distance alone would put her first.
      // Only the name match can flip it, which is what this asserts.
      const named = nurse({
        user_id: "zz-named",
        name_match: true,
        distance_miles: 400,
      });
      const farFeatured = nurse({
        user_id: "aa-far",
        tier: "featured",
        distance_miles: 200,
      });

      expect(
        rankNurses([farFeatured, named], null, ctx).map((n) => n.user_id),
      ).toEqual(["zz-named", "aa-far"]);
    });

    it("orders two named nurses by distance between themselves", () => {
      const far = nurse({ user_id: "aa-far", name_match: true, distance_miles: 40 });
      const near = nurse({ user_id: "aa-near", name_match: true, distance_miles: 3 });

      expect(
        rankNurses([far, near], null, ctx).map((n) => n.user_id),
      ).toEqual(["aa-near", "aa-far"]);
    });
  });

  // An explicit sort is the family's own instruction and still wins outright.
  it("does not survive an explicitly chosen sort", () => {
    const named = nurse({ user_id: "zz-named", name_match: true, profile_completeness: 10 });
    const fuller = nurse({ user_id: "aa-fuller", profile_completeness: 90 });

    expect(
      orderNurses([named, fuller], null, { sort: "complete" }).map(
        (n) => n.user_id,
      ),
    ).toEqual(["aa-fuller", "zz-named"]);
  });
});
