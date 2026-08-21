import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// #770. These assert on the PAYLOAD getSavedNurses returns, not on what the
// card renders. NurseCard.test.tsx asserts what is displayed and stayed green
// through the original #381 defect, because the raw last name was still in the
// RSC payload the browser downloaded.

const LAST_NAME = "Rodriguez";

const savedRows = [
  { nurse_user_id: "nurse-1", saved_at: "2026-01-02T00:00:00Z" },
];

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "nurse-1",
    slug: "jane-r",
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
    years_experience: 4,
    verification_status: "verified",
    users: {
      first_name: "Jane",
      last_name: LAST_NAME,
      zip_code: "11779",
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
    ...overrides,
  };
}

const state: { profiles: unknown[] } = { profiles: [] };

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "saved_nurses") {
        return createQueryBuilder({ then: () => ({ data: savedRows }) });
      }
      return createQueryBuilder({ then: () => ({ data: state.profiles }) });
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => createQueryBuilder() }),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: async () => null }));

import { getSavedNurses } from "./saves";

beforeEach(() => {
  state.profiles = [profileRow()];
});

describe("getSavedNurses identity gating", () => {
  it("does not ship the last name to a family without a subscription", async () => {
    const cards = await getSavedNurses("family-1", { canSeeIdentity: false });
    // Positive control in the same run: the fixture really did produce a card,
    // so the absence below is not the absence of any card at all.
    expect(cards).toHaveLength(1);
    expect(cards[0].first_name).toBe("Jane");
    expect(cards[0].last_name).toBe("");
    expect(JSON.stringify(cards)).not.toContain(LAST_NAME);
  });

  it("ships the last name to an entitled family", async () => {
    const cards = await getSavedNurses("family-1", { canSeeIdentity: true });
    expect(cards).toHaveLength(1);
    expect(cards[0].last_name).toBe(LAST_NAME);
    expect(JSON.stringify(cards)).toContain(LAST_NAME);
  });

  it("never ships the raw storage paths of a nurse's photos", async () => {
    state.profiles = [profileRow({ photos: ["nurse-1/private-headshot.jpg"] })];
    const cards = await getSavedNurses("family-1", { canSeeIdentity: true });
    expect(JSON.stringify(cards)).not.toContain("private-headshot");
  });
});

describe("getSavedNurses visibility", () => {
  it("drops a saved nurse who is unavailable and hidden", async () => {
    state.profiles = [
      profileRow({ is_available: false, unavailable_visibility: "hidden" }),
    ];
    expect(await getSavedNurses("family-1", { canSeeIdentity: true })).toEqual(
      [],
    );
  });

  it("keeps a saved nurse who is unavailable but badged", async () => {
    state.profiles = [
      profileRow({ is_available: false, unavailable_visibility: "badge" }),
    ];
    const cards = await getSavedNurses("family-1", { canSeeIdentity: true });
    expect(cards).toHaveLength(1);
  });
});
