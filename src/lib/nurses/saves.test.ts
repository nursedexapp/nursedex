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
    verified_at: null,
    photo_focal_x: 50,
    photo_focal_y: 25,
    years_experience: 4,
    verification_status: "verified",
    bio: "Ten years with medically complex children.",
    rate_min: 32,
    rate_max: 48,
    availability_commitment: ["part_time"],
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

const ZIP_ROWS: Record<
  string,
  { city: string; state: string; latitude: number; longitude: number }
> = {
  "11779": {
    city: "Ronkonkoma",
    state: "NY",
    latitude: 40.8151,
    longitude: -73.1279,
  },
};

const userClientRows: { rows: unknown[]; error: unknown } = {
  rows: [],
  error: null,
};
const limits: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) =>
      createQueryBuilder(
        table === "zip_codes"
          ? {
              in: (_column: unknown, zips: unknown) => ({
                data: (zips as string[])
                  .filter((z) => z in ZIP_ROWS)
                  .map((z) => ({ zip: z, ...ZIP_ROWS[z] })),
              }),
            }
          : {
              limit: (n: unknown) => {
                limits.push(n);
                return {
                  data: userClientRows.error ? null : userClientRows.rows,
                  error: userClientRows.error,
                };
              },
            },
      ),
  }),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: async () => null }));

import { SAVED_LIST_CAP, getAllSavedNurseIds, getSavedNurses } from "./saves";

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

describe("getSavedNurses card fields", () => {
  // A family reaches this page only through requireRole(FAMILY), so bio, rate
  // and availability are theirs to see whether or not they subscribe (#773).
  it("carries bio, rate and availability for the signed in family", async () => {
    const [card] = await getSavedNurses("family-1", { canSeeIdentity: false });
    expect(card.bio).toBe("Ten years with medically complex children.");
    expect(card.rate_min).toBe(32);
    expect(card.rate_max).toBe(48);
    expect(card.availability_commitment).toEqual(["part_time"]);
  });

  it("carries the town from the nurse's zip", async () => {
    const [card] = await getSavedNurses("family-1", { canSeeIdentity: false });
    expect(card.city).toBe("Ronkonkoma");
    expect(card.state).toBe("NY");
  });

  it("leaves the town blank for a zip we hold no row for", async () => {
    state.profiles = [
      profileRow({ users: { ...profileRow().users, zip_code: "06830" } }),
    ];
    const [card] = await getSavedNurses("family-1", { canSeeIdentity: false });
    expect(card.city).toBeNull();
    // Positive control: the card itself came through.
    expect(card.first_name).toBe("Jane");
  });

  it("carries the last initial without the surname", async () => {
    const [card] = await getSavedNurses("family-1", { canSeeIdentity: false });
    expect(card.last_initial).toBe("R");
    expect(card.last_name).toBe("");
  });
});

describe("getAllSavedNurseIds", () => {
  beforeEach(() => {
    userClientRows.rows = [];
    userClientRows.error = null;
    limits.length = 0;
  });

  it("returns the family's whole set", async () => {
    userClientRows.rows = [{ nurse_user_id: "a" }, { nurse_user_id: "b" }];
    const ids = await getAllSavedNurseIds("family-1");
    expect([...(ids ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty set for a family with no saves", async () => {
    expect((await getAllSavedNurseIds("family-1"))?.size).toBe(0);
  });

  // An empty set would silently widen a Saved only search to every nurse in
  // the directory. null is a third answer: we could not read it. The page can
  // then keep showing results AND say the Saved filter was not applied, rather
  // than either lying or erroring the whole directory for a signed in family.
  it("answers null on a failed read, never an empty set", async () => {
    const logged: unknown[][] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => {
        logged.push(a);
      });
    userClientRows.error = { message: "connection lost" };
    expect(await getAllSavedNurseIds("family-1")).toBeNull();
    expect(logged.map(String).join(" ")).toContain("connection lost");
    spy.mockRestore();
  });

  // PostgREST caps a request at 1,000 rows and says nothing when it truncates.
  // A short list is as wrong as no list, so it is the same answer, with its own
  // message: the remedy is the same but the cause is not.
  it("answers null when the list reaches the cap, rather than a short one", async () => {
    const logged: unknown[][] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => {
        logged.push(a);
      });
    userClientRows.rows = Array.from(
      { length: SAVED_LIST_CAP + 1 },
      (_, i) => ({ nurse_user_id: `n${i}` }),
    );
    expect(await getAllSavedNurseIds("family-1")).toBeNull();
    expect(logged.map(String).join(" ")).toContain("more than 900");
    spy.mockRestore();
  });

  it("tells the two failures apart in what it logs", async () => {
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => {
        logged.push(a.map(String).join(" "));
      });

    userClientRows.error = { message: "connection lost" };
    await getAllSavedNurseIds("family-1");
    userClientRows.error = null;
    userClientRows.rows = Array.from(
      { length: SAVED_LIST_CAP + 1 },
      (_, i) => ({ nurse_user_id: `n${i}` }),
    );
    await getAllSavedNurseIds("family-1");

    expect(logged).toHaveLength(2);
    expect(logged[0]).not.toBe(logged[1]);
    spy.mockRestore();
  });

  it("asks for one more row than the cap, so a full list is detectable", async () => {
    await getAllSavedNurseIds("family-1");
    expect(limits).toEqual([SAVED_LIST_CAP + 1]);
  });
});
