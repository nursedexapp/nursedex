// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// taxonomy.ts imports "server-only", which is not resolvable under vitest;
// stub it so the module (and its pure helpers) can be imported.
vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const state = {
    maybeSingle: {
      data: null as unknown,
      // #847. The lookup discarded its error, so a failed read fell through to
      // an insert the unique constraint refuses, and the retry read then
      // returned null: the post was saved with no category or tag at all.
      error: null as { message: string } | null,
    },
    single: { data: null as unknown, error: null as unknown },
  };
  function builder() {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert", "delete"]) b[m] = () => b;
    b.maybeSingle = () =>
      Promise.resolve(
        state.maybeSingle.error
          ? { data: null, error: state.maybeSingle.error }
          : { data: state.maybeSingle.data, error: null },
      );
    b.single = () => Promise.resolve(state.single);
    b.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    return b;
  }
  return { state, builder };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => h.builder() }),
}));

import {
  normalizeNames,
  findOrCreateCategory,
  findOrCreateTags,
  tagRelinkPostIds,
} from "./taxonomy";

describe("normalizeNames", () => {
  it("trims, drops blanks, and dedupes case-insensitively preserving order", () => {
    expect(
      normalizeNames([" Home Care ", "home care", "", "Licensing", "  "]),
    ).toEqual(["Home Care", "Licensing"]);
  });
});

describe("tagRelinkPostIds", () => {
  it("returns source posts not already linked to the target, deduped", () => {
    expect(tagRelinkPostIds(["p1", "p2", "p3", "p2"], ["p2", "p4"])).toEqual([
      "p1",
      "p3",
    ]);
  });

  it("returns nothing when every source post already has the target", () => {
    expect(tagRelinkPostIds(["p1", "p2"], ["p1", "p2", "p3"])).toEqual([]);
  });
});

describe("findOrCreateTags", () => {
  beforeEach(() => {
    h.state.maybeSingle.data = null;
    h.state.single = { data: { id: "new" }, error: null };
  });

  it("returns the id of an existing tag without inserting", async () => {
    h.state.maybeSingle.data = { id: "existing" };
    expect(await findOrCreateTags(["Home Care"])).toEqual(["existing"]);
  });

  it("creates a tag that does not exist yet", async () => {
    h.state.maybeSingle.data = null;
    h.state.single = { data: { id: "created" }, error: null };
    expect(await findOrCreateTags(["Brand New"])).toEqual(["created"]);
  });

  it("skips blank names", async () => {
    expect(await findOrCreateTags(["", "   "])).toEqual([]);
  });
});

describe("findOrCreateCategory when the lookup fails", () => {
  beforeEach(() => {
    h.state.maybeSingle = { data: null, error: null };
    h.state.single = { data: null, error: null };
  });

  it("refuses rather than saving the post with no category", async () => {
    h.state.maybeSingle.error = { message: "connection reset" };

    await expect(findOrCreateCategory("Care tips")).rejects.toThrow(
      /could not be read: connection reset/,
    );
  });

  it("still creates one when the category genuinely does not exist", async () => {
    // The positive control: an absent row has to stay an answer, or the
    // refusal above would fire on every new category anybody types.
    h.state.maybeSingle.data = null;
    h.state.single = { data: { id: "cat-1" }, error: null };

    await expect(findOrCreateCategory("Care tips")).resolves.toBe("cat-1");
  });
});
