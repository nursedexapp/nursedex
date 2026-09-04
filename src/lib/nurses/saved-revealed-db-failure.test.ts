import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// #780. The saved and revealed lists turned a failed read into an empty list,
// so a family whose data could not be read was told they had saved nothing.
// That reads as their own data having been lost, which is worse than an
// outage notice, and nothing recorded that it happened.

type Result = { data?: unknown; error?: unknown };

const state: { list: Result; cards: Result } = {
  list: { data: [] },
  cards: { data: [] },
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) =>
      createQueryBuilder({
        then: () =>
          table === "saved_nurses" || table === "reveals"
            ? state.list
            : state.cards,
      }),
  }),
}));

beforeEach(() => {
  state.list = { data: [] };
  state.cards = { data: [] };
});

const FAMILY = "family-1";
const SAVED_ROW = {
  nurse_user_id: "nurse-1",
  saved_at: "2026-01-02T00:00:00Z",
};
const REVEAL_ROW = {
  nurse_user_id: "nurse-1",
  revealed_at: "2026-01-02T00:00:00Z",
  access_expires_at: "2099-01-02T00:00:00Z",
};

describe("getSavedNurses when the database read fails", () => {
  it("raises when the saved list itself cannot be read", async () => {
    const { getSavedNurses } = await import("./saves");
    state.list = { error: { message: "connection reset by peer" } };

    await expect(
      getSavedNurses(FAMILY, { canSeeIdentity: true }),
    ).rejects.toThrow(/connection reset by peer/);
  });

  it("raises when the saved list reads but the nurse cards fail", async () => {
    const { getSavedNurses } = await import("./saves");
    state.list = { data: [SAVED_ROW] };
    state.cards = { error: { message: "permission denied" } };

    await expect(
      getSavedNurses(FAMILY, { canSeeIdentity: true }),
    ).rejects.toThrow(/permission denied/);
  });

  it("still answers with nothing saved when the read succeeds and there is nothing", async () => {
    const { getSavedNurses } = await import("./saves");

    await expect(
      getSavedNurses(FAMILY, { canSeeIdentity: true }),
    ).resolves.toEqual([]);
  });
});

describe("getRevealedNurses when the database read fails", () => {
  it("raises when the reveal list itself cannot be read", async () => {
    const { getRevealedNurses } = await import("../reveals/queries");
    state.list = { error: { message: "statement timeout" } };

    await expect(getRevealedNurses(FAMILY)).rejects.toThrow(
      /statement timeout/,
    );
  });

  it("raises when the reveals read but the nurse cards fail", async () => {
    const { getRevealedNurses } = await import("../reveals/queries");
    state.list = { data: [REVEAL_ROW] };
    state.cards = { error: { message: "permission denied" } };

    await expect(getRevealedNurses(FAMILY)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("still answers with nothing revealed when the read succeeds and there is nothing", async () => {
    const { getRevealedNurses } = await import("../reveals/queries");

    await expect(getRevealedNurses(FAMILY)).resolves.toEqual([]);
  });
});
