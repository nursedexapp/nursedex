// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// #847. These two reads decide whether a nurse's profile shows the "Hired"
// badge or the control that records a hire. Both discarded their error, so any
// failure to read came back as "this family has not hired this nurse", which
// offers a family the chance to record a hire they already recorded.

const state: {
  rows: unknown[];
  error: { message: string } | null;
} = { rows: [], error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () =>
      createQueryBuilder({
        maybeSingle: () =>
          state.error
            ? { data: null, error: state.error }
            : { data: state.rows[0] ?? null, error: null },
        then: () =>
          state.error
            ? { data: null, error: state.error }
            : { data: state.rows, error: null },
      }),
  }),
}));

import { getFamilyHireForNurse, getFamilyHiresByNurse } from "./queries";

beforeEach(() => {
  state.rows = [];
  state.error = null;
});

describe("getFamilyHireForNurse", () => {
  it("returns the hire when there is one", async () => {
    state.rows = [{ id: "h1", nurse_user_id: "n1", family_user_id: "f1" }];
    await expect(getFamilyHireForNurse("f1", "n1")).resolves.toMatchObject({
      id: "h1",
    });
  });

  it("returns null when this family genuinely has not hired the nurse", async () => {
    // The positive control for the refusal below: an absent row has to stay an
    // answer, or every un-hired nurse would take the profile to an error screen.
    await expect(getFamilyHireForNurse("f1", "n1")).resolves.toBeNull();
  });

  it("refuses when the read fails, rather than answering not hired", async () => {
    state.error = { message: "connection reset" };
    await expect(getFamilyHireForNurse("f1", "n1")).rejects.toThrow(
      "this family's hire of this nurse could not be read: connection reset",
    );
  });
});

describe("getFamilyHiresByNurse", () => {
  it("maps the hires it finds by nurse", async () => {
    state.rows = [{ id: "h1", nurse_user_id: "n1" }];
    const map = await getFamilyHiresByNurse("f1", ["n1"]);
    expect(map.get("n1")).toMatchObject({ id: "h1" });
  });

  it("refuses when the read fails, rather than returning an empty map", async () => {
    state.error = { message: "connection reset" };
    await expect(getFamilyHiresByNurse("f1", ["n1"])).rejects.toThrow(
      "this family's hires could not be read: connection reset",
    );
  });

  it("reads nothing at all for an empty list of nurses", async () => {
    // Short-circuits before the query, so a broken database cannot make an
    // empty search result fail.
    state.error = { message: "connection reset" };
    await expect(getFamilyHiresByNurse("f1", [])).resolves.toEqual(new Map());
  });
});
