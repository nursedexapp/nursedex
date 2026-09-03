import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { parseSearchParams, isEmptyFilterSet } from "./search-params";

// #776. The "Saved only" chip earns its place by composing with the other
// filters, which /dashboard/saved cannot do. The zero saves case is the one
// that produces the most confident wrong answer, so it is asserted first.

const state: {
  profiles: unknown[];
  inCalls: { column: string; values: unknown }[];
  queries: number;
} = { profiles: [], inCalls: [], queries: 0 };

function profileRow(userId: string) {
  return {
    user_id: userId,
    slug: `${userId}-slug`,
    credential: "rn",
    primary_care_type: "elderly",
    care_types: ["elderly"],
    tier: "free",
    has_photo: false,
    photos: [],
    avg_rating: null,
    review_count: 0,
    is_available: true,
    unavailable_visibility: null,
    profile_completeness: 50,
    verified_at: null,
    photo_focal_x: 50,
    photo_focal_y: 25,
    years_experience: 4,
    verification_status: "verified",
    bio: null,
    rate_min: null,
    rate_max: null,
    availability_commitment: [],
    users: {
      first_name: "Jane",
      last_name: "Rodriguez",
      zip_code: null,
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () =>
      createQueryBuilder({
        in: (column: unknown, values: unknown) => {
          state.inCalls.push({ column: String(column), values });
          return "chain";
        },
        then: () => {
          state.queries += 1;
          return { data: state.profiles };
        },
      }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => createQueryBuilder() }),
}));

vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: async () => null,
}));

import { searchNurses } from "./search";

beforeEach(() => {
  state.profiles = [profileRow("a"), profileRow("b")];
  state.inCalls = [];
  state.queries = 0;
});

const savedFilters = () => parseSearchParams({ saved: "true" });

describe("a family with no saves", () => {
  // The most confident wrong answer available: without this the family gets
  // every nurse in the directory under a grid that says it shows only saves.
  it("matches no nurses at all", async () => {
    const result = await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(),
    });
    expect(result.items).toEqual([]);
    expect(result.totalFull).toBe(0);
  });

  it("is offered no partial matches to fill the page", async () => {
    const result = await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(),
    });
    expect(result.partials).toEqual([]);
  });

  // The empty state has to be able to tell this apart from "no nurses listed
  // yet", or a family with zero saves is told we are still onboarding nurses
  // and given no way to clear the chip.
  it("counts as a filtered search, not an empty one", () => {
    expect(isEmptyFilterSet(savedFilters())).toBe(false);
  });
});

describe("a family with saves", () => {
  it("constrains the query to the saved ids", async () => {
    await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(["a"]),
    });
    const call = state.inCalls.find((c) => c.column === "user_id");
    expect(call?.values).toEqual(["a"]);
  });

  it("shows no partials, so nothing unsaved appears under a saved grid", async () => {
    state.profiles = [profileRow("a")];
    const result = await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(["a"]),
    });
    // Well under the partial threshold, which is what would normally trigger
    // the "other nurses you might consider" fill.
    expect(result.totalFull).toBe(1);
    expect(result.partials).toEqual([]);
  });

  // The positive control for the suppression above, measured on the same
  // fixture: with the chip off, the relaxed passes that produce partials do
  // run. Counting the queries proves the path was suppressed rather than
  // merely returning nothing.
  it("runs the relaxed passes when the chip is off", async () => {
    state.profiles = [profileRow("a")];
    await searchNurses({
      filters: parseSearchParams({}),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(["a"]),
    });
    expect(state.queries).toBeGreaterThan(1);
  });

  it("runs exactly one query when the chip is on", async () => {
    state.profiles = [profileRow("a")];
    await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: true,
      viewerSavedIds: new Set(["a"]),
    });
    expect(state.queries).toBe(1);
  });
});

describe("a viewer with no saved set", () => {
  // Logged out, or a nurse account. The flag in the URL does nothing, because
  // the page resolves the family from the session and passes nothing.
  it("ignores the flag rather than constraining to nobody", async () => {
    const result = await searchNurses({
      filters: savedFilters(),
      viewerIsSignedIn: false,
    });
    expect(result.items.map((n) => n.user_id).sort()).toEqual(["a", "b"]);
    expect(state.inCalls.find((c) => c.column === "user_id")).toBeUndefined();
  });
});
