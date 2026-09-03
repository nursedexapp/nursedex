// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  applyVisibleNurseFilter,
  applyListedNurseFilter,
} from "./visibility";

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

// ── The listed filter ─────────────────────────────────────────
//
// applyListedNurseFilter is applyVisibleNurseFilter plus a minimum-content
// condition: a verified nurse who has filled in nothing at all is not put in
// front of a family who is browsing (#732). 40 of the 100 visible profiles
// were exactly that on 2026-09-03.
//
// The two filters are deliberately NOT merged. applyVisibleNurseFilter is
// also what a family's SAVED nurses and the nurses she has PAID to reveal are
// read through, and a minimum applied there would delete a purchased result
// out from under her. The minimum belongs only on the surfaces that put a
// nurse in front of somebody who did not ask for her by name.
function recordingFullQuery() {
  const eqCalls: Array<[string, unknown]> = [];
  const orCalls: string[] = [];
  const q = {
    eq(column: string, value: unknown) {
      eqCalls.push([column, value]);
      return q;
    },
    or(filter: string) {
      orCalls.push(filter);
      return q;
    },
  };
  return { q, eqCalls, orCalls };
}

describe("applyListedNurseFilter", () => {
  it("applies every condition applyVisibleNurseFilter applies", () => {
    // The exact four are pinned by the applyVisibleNurseFilter tests above;
    // this asserts the listed filter does not lose any of them.
    const visible = recordingFullQuery();
    applyVisibleNurseFilter(visible.q);
    const listed = recordingFullQuery();
    applyListedNurseFilter(listed.q);
    expect(listed.eqCalls).toEqual(visible.eqCalls);
  });

  it("additionally requires a photo or a non-empty bio", () => {
    const { q, orCalls } = recordingFullQuery();
    applyListedNurseFilter(q);
    expect(orCalls).toEqual(["has_photo.eq.true,bio.neq."]);
  });

  it("returns the same query builder so callers can keep chaining", () => {
    const { q } = recordingFullQuery();
    expect(applyListedNurseFilter(q)).toBe(q);
  });
});
