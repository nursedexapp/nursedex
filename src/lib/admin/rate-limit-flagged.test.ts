// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RATE_LIMITS } from "@/lib/constants";
import { flaggedSinceDate } from "@/lib/rate-limit/flagged";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const gteCalls: Array<{ column: string; value: unknown }> = [];
  let rows: unknown[] = [];

  function from() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = (column: string, value: unknown) => {
      gteCalls.push({ column, value });
      return b;
    };
    // The Supabase builder is thenable, so `await q` resolves the rows.
    b.order = (): unknown => Promise.resolve({ data: rows });
    return b;
  }

  return {
    gteCalls,
    from,
    setRows: (r: unknown[]) => {
      rows = r;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: h.from }),
}));
vi.mock("@/lib/comments/queries", () => ({ getPendingCommentCount: vi.fn() }));

import { getRateLimitFlagged } from "./queries";

beforeEach(() => {
  h.gteCalls.length = 0;
  h.setRows([]);
});

describe("getRateLimitFlagged threshold (issue #576)", () => {
  it("queries the flag threshold from RATE_LIMITS, not a hardcoded literal", async () => {
    await getRateLimitFlagged();
    // Compared against the constant, so raising CONSECUTIVE_CAPTCHA_DAYS_FLAG
    // without updating this query fails here instead of silently showing the
    // wrong accounts on the admin flagged tab.
    expect(h.gteCalls).toContainEqual({
      column: "consecutive_captcha_days",
      value: RATE_LIMITS.CONSECUTIVE_CAPTCHA_DAYS_FLAG,
    });
  });

  /**
   * #425: the flag rows never expire, so without a window this tab listed
   * every family ever flagged and the daily digest counted them. The tab and
   * the digest have to answer the same question, or the email says four and
   * the page shows one (L16).
   */
  it("lists only families flagged inside the recent window", async () => {
    await getRateLimitFlagged();

    expect(h.gteCalls).toContainEqual({
      column: "date",
      value: flaggedSinceDate(new Date()),
    });
  });
});

describe("getRateLimitFlagged rows", () => {
  it("returns an empty list when no family is over the threshold", async () => {
    expect(await getRateLimitFlagged()).toEqual([]);
  });

  it("keeps only the most recent day per family", async () => {
    h.setRows([
      {
        family_user_id: "fam-1",
        consecutive_captcha_days: 5,
        date: "2026-07-09",
        users: { email: "a@example.com", first_name: "A", last_name: "One" },
      },
      {
        family_user_id: "fam-1",
        consecutive_captcha_days: 4,
        date: "2026-07-08",
        users: { email: "a@example.com", first_name: "A", last_name: "One" },
      },
      {
        family_user_id: "fam-2",
        consecutive_captcha_days: 3,
        date: "2026-07-09",
        users: { email: "b@example.com", first_name: "B", last_name: "Two" },
      },
    ]);

    const flagged = await getRateLimitFlagged();

    expect(flagged).toHaveLength(2);
    expect(flagged[0]).toMatchObject({
      family_user_id: "fam-1",
      consecutive_captcha_days: 5,
      date: "2026-07-09",
      email: "a@example.com",
    });
    expect(flagged.map((f) => f.family_user_id)).toEqual(["fam-1", "fam-2"]);
  });

  it("drops a row whose joined user is missing rather than rendering a blank account", async () => {
    h.setRows([
      {
        family_user_id: "fam-3",
        consecutive_captcha_days: 3,
        date: "2026-07-09",
        users: null,
      },
    ]);

    expect(await getRateLimitFlagged()).toEqual([]);
  });
});
