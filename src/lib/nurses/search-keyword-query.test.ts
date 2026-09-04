import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { parseSearchParams } from "./search-params";

/**
 * #729, the query half. What the family typed has to reach the database as a
 * pattern over the fields she can see, plus the nurses whose NAME matched,
 * which cannot travel in the same clause: PostgREST refuses a filter on an
 * embedded table inside a top-level `or` (measured, 400 "failed to parse
 * logic tree"), so the names are matched first and carried as ids.
 */

const NAMES = [
  { user_id: "nurse-1", users: { first_name: "Marisol", last_name: "Okonkwo" } },
  { user_id: "nurse-2", users: { first_name: "Jane", last_name: "Marisco" } },
];

// Every `or` clause the search sent, and every column list it selected.
const selects: string[] = [];
const orClauses: string[] = [];

/** Lets one test break the name lookup without touching the card query. */
const state = { nameReadFails: false, cardRows: null as unknown[] | null };

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
      last_name: "Rodriguez",
      zip_code: null,
      communication_preference: "email",
      is_deleted: false,
      is_suspended: false,
    },
    ...overrides,
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    // Each call gets its own builder, and each builder answers according to
    // the columns IT selected. Keying on the last select seen anywhere is
    // what one version of this mock did, and it handed the card query the
    // name rows, because the two queries are built in one order and awaited
    // in another.
    from: () => {
      let selected = "";
      return createQueryBuilder({
        select: (...args: unknown[]) => {
          selected = String(args[0]);
          selects.push(selected);
          return "chain";
        },
        or: (...args: unknown[]) => {
          orClauses.push(String(args[0]));
          return "chain";
        },
        then: () => {
          if (selected.includes("slug"))
            return { data: state.cardRows ?? [profileRow()] };
          return state.nameReadFails
            ? { data: null, error: { message: "connection reset" } }
            : { data: NAMES };
        },
      });
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => createQueryBuilder({ in: () => ({ data: [] }) }),
  }),
}));

vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: async () => null,
}));

import { searchNurses } from "./search";

beforeEach(() => {
  selects.length = 0;
  orClauses.length = 0;
  state.nameReadFails = false;
  state.cardRows = null;
});

const keywordClause = () => orClauses.find((c) => c.includes("ilike"));

describe("a keyword search", () => {
  it("asks the database for the keyword in the bio and the care philosophy", async () => {
    await searchNurses({
      filters: parseSearchParams({ q: "dementia" }),
      viewerIsSignedIn: true,
    });

    expect(keywordClause()).toContain('bio.ilike."*dementia*"');
    expect(keywordClause()).toContain('care_philosophy.ilike."*dementia*"');
  });

  it("does not match the care philosophy for a viewer who is not shown it", async () => {
    await searchNurses({
      filters: parseSearchParams({ q: "dementia" }),
      viewerIsSignedIn: false,
    });

    // The bio is safe to match for anyone: it is already the public meta
    // description of the nurse's profile page. The care philosophy is not
    // shown to a logged out visitor anywhere, so matching it would confirm
    // its contents through the result count, one guess at a time (#935).
    expect(keywordClause()).toContain('bio.ilike."*dementia*"');
    expect(keywordClause()).not.toContain("care_philosophy");
  });

  it("still finds a nurse by name for a viewer who is not signed in", async () => {
    // The gate is on the philosophy, not on searching at all.
    await searchNurses({
      filters: parseSearchParams({ q: "marisol" }),
      viewerIsSignedIn: false,
    });

    expect(keywordClause()).toContain("user_id.in.(nurse-1)");
  });

  it("carries the nurses whose name matched, which cannot travel in the same clause", async () => {
    await searchNurses({
      filters: parseSearchParams({ q: "marisol" }),
      viewerIsSignedIn: true,
    });

    // Only the nurse whose FIRST name matched: this viewer sees no last names.
    expect(keywordClause()).toContain("user_id.in.(nurse-1)");
    expect(keywordClause()).not.toContain("nurse-2");
  });

  it("finds a nurse by last name for a viewer who is already shown last names", async () => {
    await searchNurses({
      filters: parseSearchParams({ q: "marisco" }),
      viewerIsSignedIn: true,
      viewerCanSeeIdentity: true,
    });

    expect(keywordClause()).toContain("user_id.in.(nurse-2)");
  });

  it("does not let an unsubscribed viewer confirm a last name by typing it", async () => {
    await searchNurses({
      filters: parseSearchParams({ q: "marisco" }),
      viewerIsSignedIn: true,
      viewerCanSeeIdentity: false,
    });

    // No id list at all: nobody matched by a name she is allowed to search.
    expect(keywordClause()).not.toContain("user_id.in");
  });

  it("sends no keyword clause when the box is empty", async () => {
    await searchNurses({
      filters: parseSearchParams({}),
      viewerIsSignedIn: true,
    });

    expect(keywordClause()).toBeUndefined();
  });

  it("sends no keyword clause for a keyword that is nothing but wildcards", async () => {
    // "**" would match every nurse, which reads as the search being ignored.
    await searchNurses({
      filters: parseSearchParams({ q: "%%%" }),
      viewerIsSignedIn: true,
    });

    expect(keywordClause()).toBeUndefined();
  });
});

describe("when the name lookup fails", () => {
  it("refuses rather than reporting that nobody has that name", async () => {
    state.nameReadFails = true;

    // "We could not look" and "there is no such nurse" are the same screen to
    // a family holding a recommendation, and the wrong one of them tells her
    // the nurse she was given is not on NurseDex (#780).
    await expect(
      searchNurses({
        filters: parseSearchParams({ q: "marisol" }),
        viewerIsSignedIn: true,
      }),
    ).rejects.toThrow(/name search failed/i);
  });

  it("does not fall back to a bio-only search, which would answer a different question", async () => {
    state.nameReadFails = true;

    await expect(
      searchNurses({
        filters: parseSearchParams({ q: "marisol" }),
        viewerIsSignedIn: true,
      }),
    ).rejects.toThrow();

    // Positive control in the same fixture: with the lookup healthy, the same
    // search does reach the card query.
    state.nameReadFails = false;
    const ok = await searchNurses({
      filters: parseSearchParams({ q: "marisol" }),
      viewerIsSignedIn: true,
    });
    expect(ok.items).toHaveLength(1);
  });
});


/**
 * The ranking half of #936. The query already found both nurses; what was
 * missing is that the one the family NAMED came back somewhere below the one
 * whose bio happened to contain the same string.
 *
 * Asserted through searchNurses rather than through the ranking alone,
 * because the rule and the wiring are two different things: the ranking can
 * be right while nothing ever tells it who matched by name.
 */
describe("what a name search puts first", () => {
  /** nurse-1 is Marisol Okonkwo in NAMES, so she is the name match. */
  const named = () =>
    profileRow({
      user_id: "nurse-1",
      slug: "marisol-o",
      profile_completeness: 10,
      has_photo: false,
      review_count: 0,
    });

  /** In no NAMES row, so she can only have matched on her bio text. */
  const textOnly = () =>
    profileRow({
      user_id: "nurse-9",
      slug: "someone-else",
      bio: "Marisol was my mentor.",
      profile_completeness: 100,
      has_photo: true,
      review_count: 30,
      avg_rating: 5,
      users: {
        first_name: "Dana",
        last_name: "Vance",
        zip_code: null,
        communication_preference: "email",
        is_deleted: false,
        is_suspended: false,
      },
    });

  it("puts the nurse whose name matched above one matched only on her bio", async () => {
    // The text-only nurse wins on every other signal there is, so nothing but
    // the name match can put the named one first.
    state.cardRows = [textOnly(), named()];

    const result = await searchNurses({
      filters: parseSearchParams({ q: "marisol" }),
      viewerIsSignedIn: true,
    });

    expect(result.items.map((n) => n.user_id)).toEqual(["nurse-1", "nurse-9"]);
  });

  it("does not carry the name match onto the card sent to the browser", async () => {
    state.cardRows = [named()];

    const result = await searchNurses({
      filters: parseSearchParams({ q: "marisol" }),
      viewerIsSignedIn: true,
    });

    // It describes one search, not the nurse, and this object is serialised
    // to the client.
    expect(result.items[0]).not.toHaveProperty("name_match");
  });

  it("leaves the order alone when there is no keyword at all", async () => {
    state.cardRows = [named(), textOnly()];

    const result = await searchNurses({
      filters: parseSearchParams({}),
      viewerIsSignedIn: true,
    });

    // No keyword, so no name match: the fuller profile with a photo wins, as
    // it did before any of this.
    expect(result.items.map((n) => n.user_id)).toEqual(["nurse-9", "nurse-1"]);
  });
});
