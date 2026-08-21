import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signPhoto = vi.fn();
vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: (path: string) => signPhoto(path),
}));

import {
  NURSE_CARD_COLUMNS,
  attachNurseCardPhotos,
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
    const card = shapeNurseCard(rawRow(), { canSeeIdentity: false });
    expect(card.last_name).toBe("");
    expect(card.first_name).toBe("Jane");
  });

  it("keeps last_name for an entitled viewer", () => {
    const card = shapeNurseCard(rawRow(), { canSeeIdentity: true });
    expect(card.last_name).toBe("Rodriguez");
  });

  it("carries no raw last_name anywhere on the ungated card", () => {
    const card = shapeNurseCard(rawRow(), { canSeeIdentity: false });
    expect(JSON.stringify(card)).not.toContain("Rodriguez");
  });
});

describe("shapeNurseCard row assertion", () => {
  it("throws naming the missing profile column", () => {
    const { review_count: _dropped, ...row } = rawRow();
    expect(() => shapeNurseCard(row, { canSeeIdentity: false })).toThrow(
      /nurse card row is missing column\(s\): review_count/,
    );
  });

  it("throws naming the missing user column", () => {
    const row = rawRow();
    const { zip_code: _dropped, ...users } = row.users;
    expect(() =>
      shapeNurseCard({ ...row, users }, { canSeeIdentity: false }),
    ).toThrow(/nurse card row is missing user column\(s\): zip_code/);
  });

  it("names every missing column at once, not just the first", () => {
    const { review_count: _a, years_experience: _b, ...row } = rawRow();
    try {
      shapeNurseCard(row, { canSeeIdentity: false });
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
      { canSeeIdentity: true },
    );
    expect(card.avg_rating).toBeNull();
    expect(card.has_photo).toBe(false);
  });

  // A missing embed is a different cause from a missing column and gets its
  // own message.
  it("throws a distinct message when the users embed is absent", () => {
    const { users: _users, ...row } = rawRow();
    expect(() => shapeNurseCard(row, { canSeeIdentity: false })).toThrow(
      /nurse card row has no users embed/,
    );
  });
});

describe("shapeNurseCard field mapping", () => {
  it("maps profile and user columns onto the card", () => {
    const card = shapeNurseCard(rawRow(), { canSeeIdentity: true });
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
      { canSeeIdentity: true },
    );
    expect(card.first_name).toBe("");
    expect(card.last_name).toBe("");
  });
});

describe("toPublicNurseCard", () => {
  it("drops the raw photos array so it never reaches the browser", () => {
    const card = toPublicNurseCard(
      shapeNurseCard(rawRow(), { canSeeIdentity: true }),
    );
    expect("photos" in card).toBe(false);
    expect(JSON.stringify(card)).not.toContain("nurse-1/1.jpg");
  });
});

describe("shapeNurseCards", () => {
  it("shapes every row", () => {
    const cards = shapeNurseCards(
      [rawRow({ user_id: "a" }), rawRow({ user_id: "b" })],
      { canSeeIdentity: false },
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
    });
    expect(cards).toEqual([]);
  });

  it("still throws on a row that is missing a column", () => {
    const { slug: _dropped, ...row } = rawRow();
    expect(() => shapeNurseCards([row], { canSeeIdentity: false })).toThrow(
      /missing column\(s\): slug/,
    );
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
      }),
      shapeNurseCard(rawRow({ user_id: "b", photos: [] }), {
        canSeeIdentity: true,
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
      }),
      shapeNurseCard(rawRow({ user_id: "good", photos: ["good/1.jpg"] }), {
        canSeeIdentity: true,
      }),
    ];
    await attachNurseCardPhotos(cards);
    expect(cards[0].photo_url).toBeNull();
    expect(cards[1].photo_url).toBe("signed:good/1.jpg");
    expect(logged).toHaveLength(1);
  });
});
