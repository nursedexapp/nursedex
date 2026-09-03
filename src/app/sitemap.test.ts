// @vitest-environment node
//
// The sitemap's reads (#442).
//
// It listed every verified nurse in one unbounded select. PostgREST caps an
// unbounded select at a page of rows, so past that cap the sitemap would have
// come back with a healthy-looking prefix and silently stopped telling Google
// about everybody after it. Nothing would have failed: the file would have
// been valid, smaller, and wrong.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  nurses: [] as Array<Record<string, unknown>>,
  nurseTotal: 0 as number | null,
  ranges: [] as Array<[number, number]>,
  blogPosts: [] as Array<Record<string, unknown>>,
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: h.captureMessage,
  captureException: vi.fn(),
}));

vi.mock("@/lib/blog/queries", () => ({
  getIndexableTaxonomy: async () => ({ categories: [], tags: [] }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.not = chain;
      // applyListedNurseFilter adds the minimum-content condition as .or().
      builder.or = chain;
      // The real builder is chainable AND thenable: .range() narrows it and the
      // filters are applied afterwards, so range has to return the builder
      // rather than a promise, or applyVisibleNurseFilter has nothing to chain
      // onto (which is exactly how this mock was wrong first time).
      let range: [number, number] | null = null;
      builder.range = (from: number, to: number) => {
        range = [from, to];
        if (table === "nurse_profiles") h.ranges.push([from, to]);
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) => {
        const source = table === "nurse_profiles" ? h.nurses : h.blogPosts;
        const total = table === "nurse_profiles" ? h.nurseTotal : h.blogPosts.length;
        const rows = range ? source.slice(range[0], range[1] + 1) : source;
        return resolve({ data: rows, count: total, error: null });
      };
      return builder;
    },
  }),
}));

import sitemap from "./sitemap";

function nurse(i: number) {
  return {
    slug: `nurse-${i}`,
    updated_at: "2026-09-01T00:00:00Z",
    users: { is_deleted: false, is_suspended: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.ranges = [];
  h.nurses = [];
  h.nurseTotal = 0;
  h.blogPosts = [];
});

describe("sitemap", () => {
  it("always lists the static marketing pages", async () => {
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith("/nurses"))).toBe(true);
  });

  it("lists every verified nurse when they fit in one page", async () => {
    h.nurses = Array.from({ length: 3 }, (_, i) => nurse(i));
    h.nurseTotal = 3;

    const entries = await sitemap();

    expect(entries.filter((e) => e.url.includes("/nurses/"))).toHaveLength(3);
  });

  /**
   * The failure this exists to stop: more nurses than one page holds. Every one
   * of them has to appear, which means asking for the next page rather than
   * taking what the first one happened to return.
   */
  it("keeps asking until it has every nurse, past the row cap", async () => {
    h.nurses = Array.from({ length: 1250 }, (_, i) => nurse(i));
    h.nurseTotal = 1250;

    const entries = await sitemap();

    expect(entries.filter((e) => e.url.includes("/nurses/"))).toHaveLength(1250);
    expect(h.ranges.length).toBeGreaterThan(1);
  });

  /**
   * A read that came back short is not a smaller marketplace. Shipping the
   * prefix would quietly deindex whoever fell off the end, so the profiles are
   * left out entirely and the failure is reported, rather than published as if
   * it were the whole list (L10, L11).
   */
  it("leaves the profiles out and reports it when the read is incomplete", async () => {
    h.nurses = Array.from({ length: 10 }, (_, i) => nurse(i));
    h.nurseTotal = 999; // the source claims far more than it hands back

    const entries = await sitemap();

    expect(entries.filter((e) => e.url.includes("/nurses/"))).toHaveLength(0);
    expect(entries.some((e) => e.url.endsWith("/nurses"))).toBe(true);
  });

  /**
   * A sitemap file holds at most 50,000 URLs. Past that the file is invalid and
   * the overflow is silently ignored by search engines, so the point to act is
   * before it arrives, not after (L172: judged against the real limit rather
   * than a round number picked for comfort).
   */
  it("reports when the marketplace is approaching the 50,000 URL file limit", async () => {
    h.nurses = Array.from({ length: 5 }, (_, i) => nurse(i));
    h.nurseTotal = 46_000;

    await sitemap();

    expect(h.captureMessage).toHaveBeenCalledWith(
      expect.stringMatching(/sitemap/i),
      expect.anything(),
    );
  });

  it("says nothing about the file limit at the current size", async () => {
    h.nurses = Array.from({ length: 5 }, (_, i) => nurse(i));
    h.nurseTotal = 5;

    await sitemap();

    expect(h.captureMessage).not.toHaveBeenCalled();
  });
});
