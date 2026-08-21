import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { parseSearchParams } from "./search-params";

// #769. On /nurses a logged out visitor who typed a zip and picked a distance
// got zero real matches every time: distances were computed from the VIEWER's
// profile zip (null when logged out) while the filter was applied on behalf of
// the TYPED zip, so every row had a null distance and the filter rejected all
// of them. A signed in family got answers to a question they had not asked,
// measured from their profile zip rather than the box labelled "Your zip code".
//
// These go through searchNurses the way the page calls it, passing no
// viewerZip. A test that supplies viewerZip directly passes while the page
// stays broken, because supplying it is precisely what the page fails to do.

const ZIP_ROWS: Record<string, { latitude: number; longitude: number }> = {
  // Ronkonkoma, NY
  "11779": { latitude: 40.8151, longitude: -73.1279 },
  // Islip, NY, about 5 miles away
  "11751": { latitude: 40.7301, longitude: -73.2107 },
  // Buffalo, NY, about 300 miles away
  "14201": { latitude: 42.8925, longitude: -78.8797 },
};

const state: { profiles: unknown[] } = { profiles: [] };

function profileRow(userId: string, zip: string | null) {
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
      last_name: "Rodriguez",
      zip_code: zip,
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
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
        // zip_codes lookup: answer only for the zips we hold coordinates for,
        // the way the real table answers only for zips it has seeded.
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
  state.profiles = [
    profileRow("near-nurse", "11751"),
    profileRow("far-nurse", "14201"),
  ];
});

function filters(raw: Record<string, string>) {
  return parseSearchParams(raw);
}

describe("distance filter for a logged out visitor", () => {
  it("measures from the typed zip and returns the nurses inside the radius", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id)).toEqual(["near-nurse"]);
    expect(result.totalFull).toBe(1);
  });

  it("puts a real distance on the card, not null", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: null,
    });
    expect(result.items[0].distance_miles).toBeGreaterThan(0);
    expect(result.items[0].distance_miles).toBeLessThan(25);
  });

  it("widening the radius brings the far nurse back, so nothing else is dropping her", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "400" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id).sort()).toEqual([
      "far-nurse",
      "near-nurse",
    ]);
  });

  it("excludes the nurse outside the radius", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id)).not.toContain("far-nurse");
  });
});

describe("distance filter for a signed in family", () => {
  it("answers the zip the family typed, not the one on their profile", async () => {
    // Profile zip is Buffalo; the family typed Ronkonkoma. The near nurse is
    // the right answer to the question actually asked.
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: "14201",
    });
    expect(result.items.map((n) => n.user_id)).toEqual(["near-nurse"]);
  });

  it("falls back to the profile zip when nothing was typed", async () => {
    const result = await searchNurses({
      filters: filters({}),
      viewerZip: "11779",
    });
    const near = result.items.find((n) => n.user_id === "near-nurse");
    expect(near?.distance_miles).toBeGreaterThan(0);
  });
});

describe("a zip we cannot locate", () => {
  // Dropping every row is wrong in both directions: it silently empties the
  // result, and it would keep doing so for any zip with no coordinates. Say we
  // could not locate it and ignore the constraint instead.
  it("ignores the distance constraint rather than returning nothing", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "06830", distance: "25" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id).sort()).toEqual([
      "far-nurse",
      "near-nurse",
    ]);
  });

  it("names the zip it could not locate so the page can say so", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "06830", distance: "25" }),
      viewerZip: null,
    });
    expect(result.unlocatableZip).toBe("06830");
  });

  it("reports no unlocatable zip when the zip did resolve", async () => {
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: null,
    });
    expect(result.unlocatableZip).toBeNull();
  });

  it("reports no unlocatable zip when no zip was supplied at all", async () => {
    const result = await searchNurses({
      filters: filters({}),
      viewerZip: null,
    });
    expect(result.unlocatableZip).toBeNull();
  });

  it("reports an unresolvable profile zip too, since distances go missing either way", async () => {
    const result = await searchNurses({
      filters: filters({}),
      viewerZip: "06830",
    });
    expect(result.unlocatableZip).toBe("06830");
  });
});

describe("a nurse whose own zip we cannot locate", () => {
  // The nurse's zip, not the viewer's, is the one missing here. Keeping her in
  // a radius result would claim she is inside a radius nobody measured.
  it("is excluded from a radius result but does not empty it", async () => {
    state.profiles = [
      profileRow("near-nurse", "11751"),
      profileRow("unlocatable-nurse", "06830"),
    ];
    const result = await searchNurses({
      filters: filters({ zip: "11779", distance: "25" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id)).toEqual(["near-nurse"]);
  });

  it("is still returned when no distance filter was set", async () => {
    state.profiles = [profileRow("unlocatable-nurse", "06830")];
    const result = await searchNurses({
      filters: filters({ zip: "11779" }),
      viewerZip: null,
    });
    expect(result.items.map((n) => n.user_id)).toEqual(["unlocatable-nurse"]);
    expect(result.items[0].distance_miles).toBeNull();
  });
});
