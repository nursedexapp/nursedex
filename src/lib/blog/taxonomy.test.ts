// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// taxonomy.ts imports "server-only", which is not resolvable under vitest;
// stub it so the module (and its pure helpers) can be imported.
vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const state = {
    maybeSingle: { data: null as unknown },
    single: { data: null as unknown, error: null as unknown },
  };
  function builder() {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert", "delete"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: state.maybeSingle.data });
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
