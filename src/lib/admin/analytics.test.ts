// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
