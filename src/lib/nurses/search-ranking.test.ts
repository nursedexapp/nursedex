import { describe, it, expect } from "vitest";
import {
  RANKING_CRITERIA,
  rankNurses,
  rankingScore,
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
  it("has one entry per element of the ranking tuple", () => {
    const tupleLength = rankingScore(
      {
        user_id: "n",
        tier: "free",
        has_photo: false,
        communication_preference: null,
        review_count: 0,
        avg_rating: null,
        profile_completeness: 0,
      },
      null,
    ).length;
    expect(RANKING_CRITERIA).toHaveLength(tupleLength);
  });

  it("names featured first and completeness last", () => {
    expect(RANKING_CRITERIA[0].phrase).toContain("featured");
    expect(RANKING_CRITERIA.at(-1)?.phrase).toContain("complete");
  });

  it("marks the criterion that only applies to some viewers", () => {
    expect(RANKING_CRITERIA.filter((c) => c.conditional)).toHaveLength(1);
  });
});
