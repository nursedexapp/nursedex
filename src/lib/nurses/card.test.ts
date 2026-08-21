import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signPhoto = vi.fn();
vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: (path: string) => signPhoto(path),
}));

const supabaseFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => supabaseFrom(t) }),
}));

import {
  NURSE_CARD_COLUMNS,
  ZIP_LOOKUP_CAP,
  applyTowns,
  attachNurseCardPhotos,
  lookupZips,
  NURSE_CARD_ROW_KEYS,
  NURSE_CARD_USER_KEYS,
  shapeNurseCard,
  shapeNurseCards,
  toPublicNurseCard,
} from "./card";

// A row exactly as PostgREST returns it for NURSE_CARD_COLUMNS.
function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "nurse-1",
    slug: "jane-r",
    credential: "rn",
    primary_care_type: "elderly",
    care_types: ["elderly"],
    tier: "free",
    has_photo: true,
    photos: ["nurse-1/1.jpg"],
    avg_rating: 4.5,
    review_count: 3,
    is_available: true,
    unavailable_visibility: null,
    profile_completeness: 80,
    years_experience: 7,
    bio: "Ten years with medically complex children.",
    rate_min: 32,
    rate_max: 48,
    availability_commitment: ["part_time", "overnight"],
    users: {
      first_name: "Jane",
      last_name: "Rodriguez",
      zip_code: "11779",
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
    ...overrides,
  };
}

describe("NURSE_CARD_COLUMNS", () => {
  // The select string is a string literal and every producer casts its result,
  // so a field can be added to the type and the object literal while the column
  // is never fetched (#771). Derive the check from the same key lists the
  // runtime assertion uses rather than restating them by hand.
  it("selects every column the shaper requires", () => {
    const selected = NURSE_CARD_COLUMNS.split(/[\s,()]+/).filter(Boolean);
    for (const key of NURSE_CARD_ROW_KEYS) {
      expect(selected, `NURSE_CARD_COLUMNS is missing ${key}`).toContain(key);
    }
    for (const key of NURSE_CARD_USER_KEYS) {
      expect(selected, `NURSE_CARD_COLUMNS is missing users.${key}`).toContain(
        key,
      );
    }
  });

  it("embeds users with an inner join so the visibility filter can apply", () => {
    expect(NURSE_CARD_COLUMNS).toContain("users!inner");
    expect(NURSE_CARD_COLUMNS).toContain("is_deleted");
    expect(NURSE_CARD_COLUMNS).toContain("is_suspended");
  });
});

describe("shapeNurseCard identity gating", () => {
  // #381 / #770. Every field on a card ships in the RSC payload whether or not
  // the component renders it, so the gate has to be inside the one shaper all
  // three producers call, not in a prop.
  it("blanks last_name for a viewer who is not entitled", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: false,
      canSeeDetails: true,
    });
    expect(card.last_name).toBe("");
    expect(card.first_name).toBe("Jane");
  });

  it("keeps last_name for an entitled viewer", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(card.last_name).toBe("Rodriguez");
  });

  it("carries no raw last_name anywhere on the ungated card", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: false,
      canSeeDetails: true,
    });
    expect(JSON.stringify(card)).not.toContain("Rodriguez");
  });
});

describe("shapeNurseCard row assertion", () => {
  it("throws naming the missing profile column", () => {
    const { review_count: _dropped, ...row } = rawRow();
    expect(() =>
      shapeNurseCard(row, { canSeeIdentity: false, canSeeDetails: true }),
    ).toThrow(/nurse card row is missing column\(s\): review_count/);
  });

  it("throws naming the missing user column", () => {
    const row = rawRow();
    const { zip_code: _dropped, ...users } = row.users;
    expect(() =>
      shapeNurseCard(
        { ...row, users },
        { canSeeIdentity: false, canSeeDetails: true },
      ),
    ).toThrow(/nurse card row is missing user column\(s\): zip_code/);
  });

  it("names every missing column at once, not just the first", () => {
    const { review_count: _a, years_experience: _b, ...row } = rawRow();
    try {
      shapeNurseCard(row, { canSeeIdentity: false, canSeeDetails: true });
      throw new Error("expected shapeNurseCard to throw");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("review_count");
      expect(message).toContain("years_experience");
    }
  });

  // A null or false value is a legitimate value, not a missing column. Asserting
  // on truthiness would reject a nurse with no rating.
  it("accepts a row whose optional columns are null or false", () => {
    const card = shapeNurseCard(
      rawRow({
        primary_care_type: null,
        avg_rating: null,
        has_photo: false,
        unavailable_visibility: null,
        years_experience: null,
      }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.avg_rating).toBeNull();
    expect(card.has_photo).toBe(false);
  });

  // A missing embed is a different cause from a missing column and gets its
  // own message.
  it("throws a distinct message when the users embed is absent", () => {
    const { users: _users, ...row } = rawRow();
    expect(() =>
      shapeNurseCard(row, { canSeeIdentity: false, canSeeDetails: true }),
    ).toThrow(/nurse card row has no users embed/);
  });
});

describe("shapeNurseCard field mapping", () => {
  it("maps profile and user columns onto the card", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(card).toMatchObject({
      user_id: "nurse-1",
      slug: "jane-r",
      first_name: "Jane",
      credential: "rn",
      primary_care_type: "elderly",
      care_types: ["elderly"],
      tier: "free",
      has_photo: true,
      avg_rating: 4.5,
      review_count: 3,
      is_available: true,
      profile_completeness: 80,
      zip_code: "11779",
      communication_preference: "email",
      years_experience: 7,
    });
    expect(card.photo_url).toBeNull();
    expect(card.distance_miles).toBeNull();
    expect(card.photos).toEqual(["nurse-1/1.jpg"]);
  });

  it("substitutes empty strings for a null first or last name", () => {
    const card = shapeNurseCard(
      rawRow({
        users: { ...rawRow().users, first_name: null, last_name: null },
      }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.first_name).toBe("");
    expect(card.last_name).toBe("");
  });
});

describe("toPublicNurseCard", () => {
  it("drops the raw photos array so it never reaches the browser", () => {
    const card = toPublicNurseCard(
      shapeNurseCard(rawRow(), { canSeeIdentity: true, canSeeDetails: true }),
    );
    expect("photos" in card).toBe(false);
    expect(JSON.stringify(card)).not.toContain("nurse-1/1.jpg");
  });
});

describe("shapeNurseCards", () => {
  it("shapes every row", () => {
    const cards = shapeNurseCards(
      [rawRow({ user_id: "a" }), rawRow({ user_id: "b" })],
      { canSeeIdentity: false, canSeeDetails: true },
    );
    expect(cards.map((c) => c.user_id)).toEqual(["a", "b"]);
    expect(cards.every((c) => c.last_name === "")).toBe(true);
  });

  // users comes back null only when the embed matched nothing, which means the
  // nurse is not publicly visible. That is a real absence, not a bad row, so it
  // is dropped rather than thrown on.
  it("drops a row whose users embed came back null", () => {
    const cards = shapeNurseCards([rawRow({ users: null })], {
      canSeeIdentity: false,
      canSeeDetails: true,
    });
    expect(cards).toEqual([]);
  });

  it("still throws on a row that is missing a column", () => {
    const { slug: _dropped, ...row } = rawRow();
    expect(() =>
      shapeNurseCards([row], { canSeeIdentity: false, canSeeDetails: true }),
    ).toThrow(/missing column\(s\): slug/);
  });
});

describe("attachNurseCardPhotos", () => {
  let logged: unknown[][];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = [];
    signPhoto.mockReset();
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("signs the first photo of every card that has one", async () => {
    signPhoto.mockImplementation((path: string) => `signed:${path}`);
    const cards = [
      shapeNurseCard(rawRow({ user_id: "a", photos: ["a/1.jpg"] }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
      shapeNurseCard(rawRow({ user_id: "b", photos: [] }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
    ];
    await attachNurseCardPhotos(cards);
    expect(cards[0].photo_url).toBe("signed:a/1.jpg");
    expect(cards[1].photo_url).toBeNull();
    expect(logged).toEqual([]);
  });

  // A signing failure and a nurse who never uploaded a photo look identical on
  // the card, so the failure has to say so somewhere. Without this a broken
  // bucket reads as an onboarding gap.
  it("leaves the card usable but reports a signing failure", async () => {
    signPhoto.mockRejectedValue(new Error("bucket unreachable"));
    const cards = [
      shapeNurseCard(rawRow({ photos: ["nurse-1/1.jpg"] }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
    ];
    await attachNurseCardPhotos(cards);
    expect(cards[0].photo_url).toBeNull();
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain("nurse-1/1.jpg");
    expect(String(logged[0][1])).toContain("bucket unreachable");
  });

  // One failing photo must not cost the other nurses their photos.
  it("still signs the other cards when one fails", async () => {
    signPhoto.mockImplementation((path: string) => {
      if (path === "bad/1.jpg") return Promise.reject(new Error("nope"));
      return Promise.resolve(`signed:${path}`);
    });
    const cards = [
      shapeNurseCard(rawRow({ user_id: "bad", photos: ["bad/1.jpg"] }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
      shapeNurseCard(rawRow({ user_id: "good", photos: ["good/1.jpg"] }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
    ];
    await attachNurseCardPhotos(cards);
    expect(cards[0].photo_url).toBeNull();
    expect(cards[1].photo_url).toBe("signed:good/1.jpg");
    expect(logged).toHaveLength(1);
  });
});

// #773. Every field on a card ships in the RSC payload the browser downloads,
// so the fields a logged out visitor may not see are blanked in the data, not
// hidden in markup (decision D1).
describe("shapeNurseCard detail gating", () => {
  function shaped(canSeeDetails: boolean) {
    return shapeNurseCard(rawRow(), { canSeeIdentity: false, canSeeDetails });
  }

  it("blanks bio, rate and availability for a logged out visitor", () => {
    const card = shaped(false);
    expect(card.bio).toBeNull();
    expect(card.rate_min).toBeNull();
    expect(card.rate_max).toBeNull();
    expect(card.availability_commitment).toEqual([]);
  });

  it("ships none of those values anywhere in the payload", () => {
    const payload = JSON.stringify(shaped(false));
    expect(payload).not.toContain("medically complex");
    expect(payload).not.toContain("32");
    expect(payload).not.toContain("overnight");
  });

  it("ships them to a signed in viewer", () => {
    const card = shaped(true);
    expect(card.bio).toBe("Ten years with medically complex children.");
    expect(card.rate_min).toBe(32);
    expect(card.rate_max).toBe(48);
    expect(card.availability_commitment).toEqual(["part_time", "overnight"]);
  });

  // Gating must not turn "this nurse set no rate" into "you cannot see it".
  // The card has to be able to tell those apart, because the locked footer
  // wording is derived from the nurse's own record (#774).
  it("leaves a signed in viewer with nulls when the nurse set nothing", () => {
    const card = shapeNurseCard(
      rawRow({
        bio: null,
        rate_min: null,
        rate_max: null,
        availability_commitment: [],
      }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.bio).toBeNull();
    expect(card.rate_min).toBeNull();
    expect(card.rate_max).toBeNull();
    expect(card.availability_commitment).toEqual([]);
  });

  it("coerces a numeric rate that arrives as a string", () => {
    // PostgREST can hand back numeric(6,2) as a string depending on the
    // client. A string here would render as "32.00" and compare wrongly.
    const card = shapeNurseCard(
      rawRow({ rate_min: "32.00", rate_max: "48.50" }),
      {
        canSeeIdentity: true,
        canSeeDetails: true,
      },
    );
    expect(card.rate_min).toBe(32);
    expect(card.rate_max).toBe(48.5);
  });

  it("refuses a rate it cannot read rather than showing a wrong one", () => {
    expect(() =>
      shapeNurseCard(rawRow({ rate_min: "about thirty" }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
    ).toThrow(/rate_min/);
  });
});

describe("bio clamping by tier (decision D9)", () => {
  const long = "word ".repeat(200).trim();

  it("leaves a short bio alone", () => {
    const card = shapeNurseCard(rawRow({ bio: "Short and plain." }), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(card.bio).toBe("Short and plain.");
  });

  it("caps a free nurse at 150 characters", () => {
    const card = shapeNurseCard(rawRow({ bio: long }), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(card.bio!.length).toBeLessThanOrEqual(151);
    expect(card.bio!.length).toBeGreaterThan(100);
  });

  // A single cap would cut the paid tier off on the page families browse.
  it("gives a featured nurse more room than a free one", () => {
    const free = shapeNurseCard(rawRow({ bio: long, tier: "free" }), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    const featured = shapeNurseCard(rawRow({ bio: long, tier: "featured" }), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(featured.bio!.length).toBeGreaterThan(free.bio!.length);
    expect(featured.bio!.length).toBeLessThanOrEqual(501);
  });

  it("does not ship the part it cut", () => {
    const bio = `${"a ".repeat(80)}SECRETTAIL`;
    const card = shapeNurseCard(rawRow({ bio }), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(JSON.stringify(card)).not.toContain("SECRETTAIL");
  });

  it("cuts on a word boundary and marks the cut", () => {
    const card = shapeNurseCard(
      rawRow({ bio: "Ronkonkoma ".repeat(40).trim() }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.bio!.endsWith("\u2026")).toBe(true);
    expect(card.bio).not.toMatch(/Ronkon\u2026$/);
  });
});

describe("has_rate and has_availability", () => {
  // The locked footer wording is derived from these, so they must report the
  // nurse's record even when the viewer may not see the values themselves.
  it("are true for a logged out viewer when the nurse has set them", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: false,
      canSeeDetails: false,
    });
    expect(card.has_rate).toBe(true);
    expect(card.has_availability).toBe(true);
    expect(card.rate_min).toBeNull();
    expect(card.availability_commitment).toEqual([]);
  });

  it("are false when the nurse has set neither", () => {
    const card = shapeNurseCard(
      rawRow({ rate_min: null, rate_max: null, availability_commitment: [] }),
      { canSeeIdentity: false, canSeeDetails: false },
    );
    expect(card.has_rate).toBe(false);
    expect(card.has_availability).toBe(false);
  });

  it("counts a rate with only one end set", () => {
    const fromOnly = shapeNurseCard(rawRow({ rate_max: null }), {
      canSeeIdentity: false,
      canSeeDetails: false,
    });
    const toOnly = shapeNurseCard(rawRow({ rate_min: null }), {
      canSeeIdentity: false,
      canSeeDetails: false,
    });
    expect(fromOnly.has_rate).toBe(true);
    expect(toOnly.has_rate).toBe(true);
  });
});

describe("last initial", () => {
  it("is a single letter, whatever the viewer may see", () => {
    for (const canSeeIdentity of [true, false]) {
      const card = shapeNurseCard(rawRow(), {
        canSeeIdentity,
        canSeeDetails: true,
      });
      expect(card.last_initial).toBe("R");
    }
  });

  it("never carries the rest of the name", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: false,
      canSeeDetails: true,
    });
    expect(card.last_initial).toHaveLength(1);
    expect(JSON.stringify(card)).not.toContain("Rodriguez");
  });

  it("uppercases a lowercase surname", () => {
    const card = shapeNurseCard(
      rawRow({ users: { ...rawRow().users, last_name: "rodriguez" } }),
      { canSeeIdentity: false, canSeeDetails: true },
    );
    expect(card.last_initial).toBe("R");
  });

  it("is empty when the nurse has no last name on file", () => {
    const card = shapeNurseCard(
      rawRow({ users: { ...rawRow().users, last_name: null } }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.last_initial).toBe("");
  });

  it("skips leading whitespace rather than taking it as the initial", () => {
    const card = shapeNurseCard(
      rawRow({ users: { ...rawRow().users, last_name: "  Okafor" } }),
      { canSeeIdentity: true, canSeeDetails: true },
    );
    expect(card.last_initial).toBe("O");
  });
});

describe("town", () => {
  it("starts empty, since it comes from the zip lookup", () => {
    const card = shapeNurseCard(rawRow(), {
      canSeeIdentity: true,
      canSeeDetails: true,
    });
    expect(card.city).toBeNull();
    expect(card.state).toBeNull();
  });
});

describe("lookupZips", () => {
  it("caps the zip list and says so rather than dropping towns silently", async () => {
    const logged: unknown[][] = [];
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    const asked: string[][] = [];
    supabaseFrom.mockImplementation(() => ({
      select: () => ({
        in: (_column: string, zips: string[]) => {
          asked.push(zips);
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }));

    const tooMany = Array.from({ length: ZIP_LOOKUP_CAP + 7 }, (_, i) =>
      String(10000 + i),
    );
    await lookupZips(tooMany);

    expect(asked[0]).toHaveLength(ZIP_LOOKUP_CAP);
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain("7 zip(s) not looked up");
    errorSpy.mockRestore();
  });

  it("asks once for a zip many nurses share", async () => {
    const asked: string[][] = [];
    supabaseFrom.mockImplementation(() => ({
      select: () => ({
        in: (_column: string, zips: string[]) => {
          asked.push(zips);
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }));
    await lookupZips(["11779", "11779", "11751", "11779"]);
    expect(asked[0]).toEqual(["11779", "11751"]);
  });

  it("runs no query at all when there is nothing to look up", async () => {
    supabaseFrom.mockClear();
    const rows = await lookupZips([]);
    expect(rows.size).toBe(0);
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  // A failed read and a set of zips we hold nothing for both leave the town
  // blank, which is a designed state on the card. The difference has to be
  // visible somewhere, so it is logged.
  it("reports a failed read instead of passing it off as no rows", async () => {
    const logged: unknown[][] = [];
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    supabaseFrom.mockImplementation(() => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: null,
            error: { message: "connection lost" },
          }),
      }),
    }));
    const rows = await lookupZips(["11779"]);
    expect(rows.size).toBe(0);
    expect(String(logged[0]?.[1])).toContain("connection lost");
    errorSpy.mockRestore();
  });
});

describe("applyTowns", () => {
  it("writes the town onto the cards that have a matching zip", () => {
    const cards = [
      shapeNurseCard(rawRow({ user_id: "a" }), {
        canSeeIdentity: true,
        canSeeDetails: true,
      }),
      shapeNurseCard(
        rawRow({
          user_id: "b",
          users: { ...rawRow().users, zip_code: "06830" },
        }),
        { canSeeIdentity: true, canSeeDetails: true },
      ),
    ];
    applyTowns(
      cards,
      new Map([
        [
          "11779",
          { city: "Ronkonkoma", state: "NY", latitude: 1, longitude: 2 },
        ],
      ]),
    );
    expect(cards[0].city).toBe("Ronkonkoma");
    expect(cards[0].state).toBe("NY");
    expect(cards[1].city).toBeNull();
  });
});
