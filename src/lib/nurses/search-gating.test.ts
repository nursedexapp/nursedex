import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { parseSearchParams } from "./search-params";

// #773. bio, rate and availability are blanked in the DATA for a logged out
// visitor, not hidden in markup, because every field on a card ships in the
// RSC payload the browser downloads (decision D1). These go through
// searchNurses the way each page calls it.

const BIO = "Ten years with medically complex children.";

const ZIP_ROWS: Record<
  string,
  { city: string; state: string; latitude: number; longitude: number }
> = {
  "11751": {
    city: "Islip",
    state: "NY",
    latitude: 40.7301,
    longitude: -73.2107,
  },
};

const state: { profiles: unknown[] } = { profiles: [] };

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
    bio: BIO,
    rate_min: 32,
    rate_max: 48,
    availability_commitment: ["overnight"],
    users: {
      first_name: "Jane",
      last_name: "Rodriguez",
      zip_code: "11751",
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
    ...overrides,
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => createQueryBuilder({ then: () => ({ data: state.profiles }) }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () =>
      createQueryBuilder({
        in: (_column: unknown, zips: unknown) => ({
          data: (zips as string[])
            .filter((z) => z in ZIP_ROWS)
            .map((z) => ({ zip: z, ...ZIP_ROWS[z] })),
        }),
      }),
  }),
}));

vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: async () => null,
}));

import { searchNurses } from "./search";

beforeEach(() => {
  state.profiles = [profileRow()];
});

async function search(viewerIsSignedIn: boolean) {
  return searchNurses({
    filters: parseSearchParams({}),
    viewerZip: null,
    viewerIsSignedIn,
  });
}

describe("what a logged out visitor's payload carries", () => {
  it("has a card, so the absences below mean something", async () => {
    const result = await search(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].first_name).toBe("Jane");
  });

  it("carries no bio, rate or availability", async () => {
    const [card] = (await search(false)).items;
    expect(card.bio).toBeNull();
    expect(card.rate_min).toBeNull();
    expect(card.rate_max).toBeNull();
    expect(card.availability_commitment).toEqual([]);
  });

  it("has none of those values anywhere in the serialized payload", async () => {
    const payload = JSON.stringify(await search(false));
    expect(payload).not.toContain("medically complex");
    expect(payload).not.toContain("overnight");
    // Positive control in the same run: the signed in payload does carry them.
    expect(JSON.stringify(await search(true))).toContain("medically complex");
  });

  it("still carries the last initial, which is public", async () => {
    const [card] = (await search(false)).items;
    expect(card.last_initial).toBe("R");
    expect(card.last_name).toBe("");
  });
});

describe("what a signed in viewer's payload carries", () => {
  it("carries the bio, the rate and the availability", async () => {
    const [card] = (await search(true)).items;
    expect(card.bio).toBe(BIO);
    expect(card.rate_min).toBe(32);
    expect(card.rate_max).toBe(48);
    expect(card.availability_commitment).toEqual(["overnight"]);
  });

  it("keeps nulls for a nurse who has set none of them", async () => {
    state.profiles = [
      profileRow({
        bio: null,
        rate_min: null,
        rate_max: null,
        availability_commitment: [],
      }),
    ];
    const [card] = (await search(true)).items;
    expect(card.bio).toBeNull();
    expect(card.rate_min).toBeNull();
  });
});

describe("the town on the card", () => {
  it("comes from the nurse's zip", async () => {
    const [card] = (await search(false)).items;
    expect(card.city).toBe("Islip");
    expect(card.state).toBe("NY");
  });

  it("is blank for a zip we hold no row for, rather than a wrong town", async () => {
    state.profiles = [
      profileRow({ users: { ...profileRow().users, zip_code: "06830" } }),
    ];
    const [card] = (await search(false)).items;
    expect(card.city).toBeNull();
    expect(card.state).toBeNull();
  });

  it("is blank for a nurse with no zip on file", async () => {
    state.profiles = [
      profileRow({ users: { ...profileRow().users, zip_code: null } }),
    ];
    const [card] = (await search(false)).items;
    expect(card.city).toBeNull();
  });
});
