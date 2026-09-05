// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// #847 / #991. Sixteen count queries share one Promise.all here, and every one
// of them was read as `count ?? 0`. During a database problem the dashboard
// rendered a real ZERO for each: zero nurses, zero families, zero reveals,
// zero hires, and an MRR of nothing, indistinguishable from a genuinely empty
// product. Nothing about the screen said anything was wrong.
//
// An element of a Promise.all has no destructuring for a lint rule to inspect
// and no name for anything to check later, which is why these are wrapped
// inside the array rather than unpacked after it.

const h = vi.hoisted(() => ({
  state: {
    count: 0 as number | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ["select", "eq", "in", "not", "gte", "order", "limit"]) {
        b[m] = chain;
      }
      b.maybeSingle = async () => ({ data: { updated_at: null }, error: null });
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          h.state.error
            ? { data: null, count: null, error: h.state.error }
            : { data: [], count: h.state.count, error: null },
        );
      return b;
    },
  }),
}));

import { getAnalyticsTotals } from "./analytics";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.state.count = 0;
  h.state.error = null;
});

describe("getAnalyticsTotals", () => {
  it("reports the counts it reads", async () => {
    h.state.count = 4;

    const totals = await getAnalyticsTotals();

    expect(totals.signups.nurse).toBe(4);
    expect(totals.totalHires).toBe(4);
    expect(totals.mrr).toBeGreaterThan(0);
  });

  it("reports a real zero, which is a product with nobody in it yet", async () => {
    // The positive control. A genuine zero has to stay an answer, or the
    // refusal below would fire on the day the product launches.
    h.state.count = 0;

    const totals = await getAnalyticsTotals();

    expect(totals.signups.total).toBe(0);
    expect(totals.mrr).toBe(0);
  });

  it("refuses rather than rendering zero across the whole dashboard", async () => {
    h.state.error = { message: "connection reset" };

    await expect(getAnalyticsTotals()).rejects.toThrow(
      /could not be read: connection reset/,
    );
  });

  it("refuses a null count with no error, because the query asked for none", async () => {
    // A count option dropped from one of the sixteen queries is silent
    // otherwise, and the number it produces is zero.
    h.state.count = null;

    await expect(getAnalyticsTotals()).rejects.toThrow(/did not ask for one/);
  });
});

/**
 * #910. An opted out account is fully present here and entirely absent from
 * PostHog, so every funnel on that side silently excludes it. Nothing counted
 * them, and the failure that arrives later looks like something else: a funnel
 * reading low resembles people dropping out of a flow rather than people never
 * having been measured.
 */
describe("accounts missing from the funnel", () => {
  it("counts them, and says what share of the roster they are", async () => {
    // Every count in the shared mock answers the same number, so nurses,
    // families and opt-outs all read 4: the share is then 4 over 8.
    h.state.count = 4;

    const totals = await getAnalyticsTotals();

    expect(totals.analyticsOptOuts).toBe(4);
    expect(totals.analyticsOptOutShare).toBeCloseTo(0.5);
  });

  it("reads the opt-out count over the same population as the signups", async () => {
    // A count read over a different set (seeded demo accounts, removed
    // accounts) would make the share a proportion of two different things,
    // and nothing on the page could be judged against it.
    const source = readFileSync("src/lib/admin/analytics.ts", "utf8");
    const optOutQuery = source.slice(
      source.indexOf('.eq("analytics_opt_out", true)'),
      source.indexOf("the count of accounts that opted out"),
    );

    expect(optOutQuery).toContain('.eq("is_deleted", false)');
    expect(optOutQuery).toContain("SEED_EMAIL_PATTERN");
  });

  it("reports a failed opt-out count as a failure, not as nobody opting out", async () => {
    // Zero opt-outs is a real and reassuring answer, which is exactly why a
    // failed read must not produce it (L90).
    h.state.error = { message: "permission denied" };

    await expect(getAnalyticsTotals()).rejects.toThrow();
  });
});
