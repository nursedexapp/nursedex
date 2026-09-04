import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { parseSearchParams } from "./search-params";

// #780. A database failure used to be turned into an empty list, so /nurses
// rendered "No nurses listed yet" during an outage: a confident, wrong claim
// about the business, shown to the people we most want to convert, with
// nothing anywhere reporting it. These assert the failure is RAISED, not that
// some particular screen appears, because the screen is the error boundary's
// job and the swallowing is this module's.

const state: { profileResult: { data?: unknown; error?: unknown } } = {
  profileResult: { data: [] },
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => createQueryBuilder({ then: () => state.profileResult }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => createQueryBuilder({ then: () => state.profileResult }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

beforeEach(() => {
  state.profileResult = { data: [] };
});

describe("searchNurses when the database read fails", () => {
  it("raises the failure instead of answering with no nurses", async () => {
    const { searchNurses } = await import("./search");
    state.profileResult = {
      error: { message: "permission denied for table nurse_profiles" },
    };

    await expect(
      searchNurses({ filters: parseSearchParams({}), viewerIsSignedIn: false }),
    ).rejects.toThrow(/permission denied for table nurse_profiles/);
  });

  it("still answers with no nurses when the read succeeds and matches nothing", async () => {
    const { searchNurses } = await import("./search");
    state.profileResult = { data: [] };

    const result = await searchNurses({
      filters: parseSearchParams({}),
      viewerIsSignedIn: false,
    });

    expect(result.items).toEqual([]);
  });
});
