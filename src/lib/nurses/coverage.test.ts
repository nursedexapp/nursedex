// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyVisibleNurseFilter } from "./visibility";
import { LISTED_MINIMUM_CONTENT, UNLISTED_EMPTY_BIO } from "./listing";

// The listing gap this measures (100 verified, 60 listed, 59 searchable on
// 2026-09-03) has only ever been read by running a query by hand on one day.
// Nothing in the product reports it and nothing would notice it growing back
// (#939). These tests pin the two things that make the number worth trusting:
// it is drawn from the SAME predicates the directory itself filters on, and a
// failed read is reported as a failure rather than as a zero.

type Recorded = { eq: Array<[string, unknown]>; or: string[] };
type Kind = "verified" | "listed" | "searchable" | "unlisted";

const h = vi.hoisted(() => {
  const builders: Array<{ eq: Array<[string, unknown]>; or: string[] }> = [];
  // Keyed by the shape of the query, so the fake answers the way the real
  // API does: whichever query asks for the unlisted set gets the unlisted
  // count. A mapping bug in the module then shows up as a swapped number.
  let counts = { verified: 100, listed: 60, searchable: 59, unlisted: 40 };
  let failOn: Kind | null = null;
  let nullCountOn: Kind | null = null;

  function kindOf(rec: Recorded): Kind {
    const hasPhotoFalse = rec.eq.some(
      ([column, value]) => column === "has_photo" && value === false,
    );
    if (hasPhotoFalse) return "unlisted";
    const available = rec.eq.some(
      ([column, value]) => column === "is_available" && value === true,
    );
    if (available) return "searchable";
    if (rec.or.length > 0) return "listed";
    return "verified";
  }

  function from() {
    const rec: Recorded = { eq: [], or: [] };
    builders.push(rec);
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (column: string, value: unknown) => {
      rec.eq.push([column, value]);
      return b;
    };
    b.or = (filter: string) => {
      rec.or.push(filter);
      return b;
    };
    b.then = (
      resolve: (v: {
        count: number | null;
        error: { message: string } | null;
      }) => unknown,
    ) => {
      const kind = kindOf(rec);
      if (failOn === kind) {
        return resolve({
          count: null,
          error: { message: `${kind} read failed` },
        });
      }
      if (nullCountOn === kind) {
        return resolve({ count: null, error: null });
      }
      return resolve({ count: counts[kind], error: null });
    };
    return b;
  }

  return {
    builders,
    from,
    reset: () => {
      builders.length = 0;
      counts = { verified: 100, listed: 60, searchable: 59, unlisted: 40 };
      failOn = null;
      nullCountOn = null;
    },
    setCounts: (next: Partial<typeof counts>) => {
      counts = { ...counts, ...next };
    },
    failOn: (kind: Kind | null) => {
      failOn = kind;
    },
    nullCountOn: (kind: Kind | null) => {
      nullCountOn = kind;
    },
    kindOf,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: h.from }),
}));

import { getDirectoryCoverage } from "./coverage";

beforeEach(() => {
  h.reset();
});

// Derived, never restated: whatever applyVisibleNurseFilter applies today is
// what every coverage query has to carry. A condition added there and missed
// here would otherwise leave the count describing a different population than
// the directory shows.
function visibleConditions(): Array<[string, unknown]> {
  const calls: Array<[string, unknown]> = [];
  const q = {
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return q;
    },
    or() {
      return q;
    },
  };
  applyVisibleNurseFilter(q);
  return calls;
}

describe("getDirectoryCoverage", () => {
  it("reports the verified, listed, searchable and unlisted counts", async () => {
    const result = await getDirectoryCoverage();
    expect(result).toMatchObject({
      ok: true,
      verified: 100,
      listed: 60,
      searchable: 59,
      unlisted: 40,
    });
  });

  it("draws every count through the shared visibility filter", async () => {
    await getDirectoryCoverage();
    expect(h.builders).toHaveLength(4);
    for (const rec of h.builders) {
      for (const condition of visibleConditions()) {
        expect(rec.eq).toContainEqual(condition);
      }
    }
  });

  it("uses the directory's own listed and unlisted predicates", async () => {
    await getDirectoryCoverage();
    const listed = h.builders.find((rec) => h.kindOf(rec) === "listed");
    const unlisted = h.builders.find((rec) => h.kindOf(rec) === "unlisted");
    const searchable = h.builders.find((rec) => h.kindOf(rec) === "searchable");
    expect(listed?.or).toContain(LISTED_MINIMUM_CONTENT);
    expect(unlisted?.or).toContain(UNLISTED_EMPTY_BIO);
    // Searchable is the listed set the default search can actually return:
    // listed, and available.
    expect(searchable?.or).toContain(LISTED_MINIMUM_CONTENT);
    expect(searchable?.eq).toContainEqual(["is_available", true]);
  });

  it("reports a failed read as a failure, not as a zero", async () => {
    h.failOn("listed");
    const result = await getDirectoryCoverage();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failed).toBe("listed");
    expect(result.message).toContain("listed read failed");
    expect(JSON.stringify(result)).not.toContain("60");
  });

  it("reports a missing count as a failure, not as a zero", async () => {
    // PostgREST can answer without an error and without a count. Folding that
    // into 0 would report an empty directory as a measurement.
    h.nullCountOn("verified");
    const result = await getDirectoryCoverage();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failed).toBe("verified");
  });

  it("flags listed plus unlisted not adding up to verified", async () => {
    // The two predicates are meant to be exact complements over the visible
    // set (visibility.ts). Nothing else compares them, so a drift between
    // them would silently change what the directory shows.
    h.setCounts({ listed: 60, unlisted: 30, verified: 100 });
    const result = await getDirectoryCoverage();
    if (!result.ok) throw new Error("expected counts");
    expect(result.reconciles).toBe(false);
  });

  it("reconciles when the two predicates cover the visible set exactly", async () => {
    const result = await getDirectoryCoverage();
    if (!result.ok) throw new Error("expected counts");
    expect(result.reconciles).toBe(true);
  });
});
