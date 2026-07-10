import { describe, it, expect } from "vitest";
import { rankNurses, type RankableNurse } from "./search-ranking";

function nurse(overrides: Partial<RankableNurse> & { user_id: string }): RankableNurse & {
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
