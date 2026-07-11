// @vitest-environment node
import { describe, it, expect } from "vitest";
import { applyVisibleNurseFilter } from "./visibility";

// applyVisibleNurseFilter is the single chokepoint that keeps non-public
// nurse profiles out of service-role queries (public lists, marketing/
// analytics email crons), which bypass the equivalent RLS policy. It must
// apply all four conditions; dropping any one would leak hidden, deleted, or
// suspended profiles into a public surface.
function recordingQuery() {
  const calls: Array<[string, unknown]> = [];
  const q = {
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return q;
    },
  };
  return { q, calls };
}

describe("applyVisibleNurseFilter", () => {
  it("applies all four public-visibility conditions", () => {
    const { q, calls } = recordingQuery();
    applyVisibleNurseFilter(q);
    expect(calls).toEqual([
      ["verification_status", "verified"],
      ["is_hidden", false],
      ["users.is_deleted", false],
      ["users.is_suspended", false],
    ]);
  });

  it("excludes unverified, hidden, deleted, and suspended profiles", () => {
    const { q, calls } = recordingQuery();
    applyVisibleNurseFilter(q);
    const applied = new Map(calls);
    // Only verified profiles are visible.
    expect(applied.get("verification_status")).toBe("verified");
    // Hidden profiles are excluded.
    expect(applied.get("is_hidden")).toBe(false);
    // Profiles whose owner is deleted or suspended are excluded.
    expect(applied.get("users.is_deleted")).toBe(false);
    expect(applied.get("users.is_suspended")).toBe(false);
  });

  it("returns the same query builder so callers can keep chaining", () => {
    const { q } = recordingQuery();
    expect(applyVisibleNurseFilter(q)).toBe(q);
  });
});
