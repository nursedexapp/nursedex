import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// #770. getRevealedNurses had no expiry test at all, so a reveal past its
// access_expires_at still rendered the nurse's full last name on the dashboard
// while migration 057's RPC refused the same family on the profile page.
// These assert on the payload, with a still-active reveal in the same fixture
// as the positive control.

const NOW = new Date("2026-06-01T12:00:00Z");
const EXPIRED = "2026-05-01T00:00:00Z"; // a month before NOW
const STILL_ACTIVE = "2026-07-01T00:00:00Z"; // a month after NOW

const state: { reveals: unknown[]; profiles: unknown[] } = {
  reveals: [],
  profiles: [],
};

function profileRow(userId: string, lastName: string) {
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
    years_experience: 4,
    verification_status: "verified",
    users: {
      first_name: "Jane",
      last_name: lastName,
      zip_code: "11779",
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) =>
      createQueryBuilder({
        then: () => ({
          data: table === "reveals" ? state.reveals : state.profiles,
        }),
      }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => createQueryBuilder({ then: () => ({ data: state.reveals }) }),
  }),
}));

import {
  getRevealedNurses,
  getRevealedNurseIds,
  isRevealActive,
} from "./queries";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.reveals = [];
  state.profiles = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isRevealActive", () => {
  it("treats a null expiry as active", () => {
    expect(isRevealActive(null, NOW.getTime())).toBe(true);
  });

  it("treats a future expiry as active", () => {
    expect(isRevealActive(STILL_ACTIVE, NOW.getTime())).toBe(true);
  });

  it("treats a past expiry as ended", () => {
    expect(isRevealActive(EXPIRED, NOW.getTime())).toBe(false);
  });

  it("treats the exact expiry moment as ended", () => {
    expect(isRevealActive(NOW.toISOString(), NOW.getTime())).toBe(false);
  });
});

describe("getRevealedNurses expiry", () => {
  beforeEach(() => {
    state.reveals = [
      {
        nurse_user_id: "expired-nurse",
        revealed_at: "2026-02-01T00:00:00Z",
        access_expires_at: EXPIRED,
      },
      {
        nurse_user_id: "active-nurse",
        revealed_at: "2026-03-01T00:00:00Z",
        access_expires_at: STILL_ACTIVE,
      },
    ];
    state.profiles = [
      profileRow("expired-nurse", "Okafor"),
      profileRow("active-nurse", "Rodriguez"),
    ];
  });

  it("drops the nurse whose access has ended and keeps the one still inside it", async () => {
    const cards = await getRevealedNurses("family-1");
    expect(cards.map((c) => c.user_id)).toEqual(["active-nurse"]);
  });

  it("ships no trace of the expired nurse's last name in the payload", async () => {
    const payload = JSON.stringify(await getRevealedNurses("family-1"));
    expect(payload).not.toContain("Okafor");
    // Positive control in the same run: the entitled nurse's name IS present,
    // so the absence above is not the absence of every card.
    expect(payload).toContain("Rodriguez");
  });

  it("agrees with getRevealedNurseIds about which reveals are live", async () => {
    const ids = await getRevealedNurseIds("family-1");
    const cards = await getRevealedNurses("family-1");
    expect([...ids].sort()).toEqual(cards.map((c) => c.user_id).sort());
  });

  it("returns nothing when every reveal has ended", async () => {
    state.reveals = [
      {
        nurse_user_id: "expired-nurse",
        revealed_at: "2026-02-01T00:00:00Z",
        access_expires_at: EXPIRED,
      },
    ];
    expect(await getRevealedNurses("family-1")).toEqual([]);
  });

  it("keeps a reveal with no expiry set", async () => {
    state.reveals = [
      {
        nurse_user_id: "active-nurse",
        revealed_at: "2026-03-01T00:00:00Z",
        access_expires_at: null,
      },
    ];
    const cards = await getRevealedNurses("family-1");
    expect(cards).toHaveLength(1);
    expect(cards[0].access_expires_at).toBeNull();
  });

  it("carries the reveal's own dates onto the card it belongs to", async () => {
    const cards = await getRevealedNurses("family-1");
    expect(cards[0]).toMatchObject({
      user_id: "active-nurse",
      revealed_at: "2026-03-01T00:00:00Z",
      access_expires_at: STILL_ACTIVE,
    });
  });
});
