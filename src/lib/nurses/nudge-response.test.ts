// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LISTED_MINIMUM_CONTENT, LISTED_CARE_TYPES_PRESENT } from "./listing";

/**
 * #947. On 2026-09-03, 25 verified nurses were asked for a licence number
 * after being sent back, and on 2026-09-04, 18 were told families cannot see
 * them. All 43 were confirmed delivered. Those two sends are the whole of the
 * supply side push, and nothing measured whether any of them acted, so the
 * only way to know was to run a query by hand, which means nobody would.
 *
 * These pin the two things that make the number worth trusting: whether a
 * nurse has MOVED is judged by the directory's own listing predicate rather
 * than by a second set of conditions written here, and a failed read is
 * reported as a failure rather than as nobody having moved.
 */
type Recorded = {
  table: string;
  eq: Array<[string, unknown]>;
  neq: Array<[string, unknown]>;
  or: string[];
  inLists: Array<[string, unknown[]]>;
  not: Array<[string, string, unknown]>;
};

const h = vi.hoisted(() => {
  const builders: Recorded[] = [];
  const state = {
    // One row per person told, as email_log holds them.
    log: [] as Array<{
      recipient_user_id: string;
      email_type: string;
      sent_at: string;
    }>,
    logError: null as { message: string } | null,
    countError: null as { message: string } | null,
    nullCount: false,
    // How many of the asked-about ids the count query answers with.
    movedCount: 0,
  };

  function from(table: string) {
    const rec: Recorded = {
      table,
      eq: [],
      neq: [],
      or: [],
      inLists: [],
      not: [],
    };
    builders.push(rec);
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (column: string, value: unknown) => {
      rec.eq.push([column, value]);
      return b;
    };
    b.neq = (column: string, value: unknown) => {
      rec.neq.push([column, value]);
      return b;
    };
    b.or = (filter: string) => {
      rec.or.push(filter);
      return b;
    };
    b.not = (column: string, op: string, value: unknown) => {
      rec.not.push([column, op, value]);
      return b;
    };
    b.in = (column: string, values: unknown[]) => {
      rec.inLists.push([column, values]);
      return b;
    };
    b.order = () => b;
    b.limit = () => b;
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === "email_log") {
        return Promise.resolve(
          h.state.logError
            ? { data: null, error: h.state.logError, count: null }
            : { data: h.state.log, error: null, count: h.state.log.length },
        ).then(resolve);
      }
      return Promise.resolve(
        h.state.countError
          ? { data: null, error: h.state.countError, count: null }
          : {
              data: null,
              error: null,
              count: h.state.nullCount ? null : h.state.movedCount,
            },
      ).then(resolve);
    };
    return b;
  }

  return { builders, state, from };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: h.from }),
}));

import { getNudgeResponse, NUDGE_COHORTS, TOLD_CAP } from "./nudge-response";

const told = (id: string, type: string, at: string) => ({
  recipient_user_id: id,
  email_type: type,
  sent_at: at,
});

beforeEach(() => {
  h.builders.length = 0;
  h.state.log = [];
  h.state.logError = null;
  h.state.countError = null;
  h.state.nullCount = false;
  h.state.movedCount = 0;
});

describe("who moved after being told", () => {
  it("reports nobody told as its own state, not as nobody moving", () => {
    // A send that has not happened and a send nobody acted on are different
    // situations, and reporting the first as "0 of 0 moved" would read as the
    // approach having failed (L98).
    expect(NUDGE_COHORTS.map((c) => c.emailType)).toEqual([
      "not_listed_nudge",
      "licence_number_needed",
    ]);
  });

  it("counts how many were told and when", async () => {
    h.state.log = [
      told("a", "not_listed_nudge", "2026-09-04T14:50:00Z"),
      told("b", "not_listed_nudge", "2026-09-04T14:51:00Z"),
    ];

    const res = await getNudgeResponse();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const nudge = res.cohorts.find((c) => c.emailType === "not_listed_nudge");
    expect(nudge).toMatchObject({
      told: 2,
      firstSentAt: "2026-09-04T14:50:00Z",
      lastSentAt: "2026-09-04T14:51:00Z",
    });
  });

  it("judges movement with the directory's own listing predicate", async () => {
    // Not a second set of conditions written here. If the rule for being
    // listed changes, this number and the directory have to change together,
    // or the readout reassures somebody about a population the directory does
    // not show (#939 took the same care).
    h.state.log = [told("a", "not_listed_nudge", "2026-09-04T14:50:00Z")];

    await getNudgeResponse();

    const counting = h.builders.find(
      (b) =>
        b.table === "nurse_profiles" && b.or.includes(LISTED_MINIMUM_CONTENT),
    );
    expect(counting).toBeTruthy();
    expect(counting?.neq).toContainEqual([
      LISTED_CARE_TYPES_PRESENT.column,
      LISTED_CARE_TYPES_PRESENT.notEqualTo,
    ]);
    expect(counting?.eq).toContainEqual(["verification_status", "verified"]);
  });

  it("asks only about the people who were actually told", async () => {
    h.state.log = [
      told("a", "not_listed_nudge", "2026-09-04T14:50:00Z"),
      told("b", "not_listed_nudge", "2026-09-04T14:51:00Z"),
    ];

    await getNudgeResponse();

    const counting = h.builders.find((b) => b.table === "nurse_profiles");
    expect(counting?.inLists).toContainEqual(["user_id", ["a", "b"]]);
  });

  it("judges a licence request by the licence number being on file", async () => {
    h.state.log = [told("a", "licence_number_needed", "2026-09-03T12:00:00Z")];
    h.state.movedCount = 1;

    const res = await getNudgeResponse();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const licence = res.cohorts.find(
      (c) => c.emailType === "licence_number_needed",
    );
    expect(licence).toMatchObject({ told: 1, moved: 1 });

    const counting = h.builders.find((b) => b.table === "nurse_profiles");
    expect(counting?.not).toContainEqual(["license_number", "is", null]);
    expect(counting?.neq).toContainEqual(["license_number", ""]);
    // Back in the queue as well as having the number, which is what she was
    // asked to do. And NOT through the visible filter: every nurse in this
    // cohort was sent back, so a predicate requiring verified would report
    // nobody having acted however many of them had.
    expect(counting?.eq).toContainEqual(["verification_status", "pending"]);
    expect(counting?.eq).not.toContainEqual([
      "verification_status",
      "verified",
    ]);
  });

  it("does not ask about movement when nobody was told", async () => {
    // The `.in()` list would be empty, which PostgREST answers with every row
    // matching nothing, and a query nobody needs is a query that can fail.
    h.state.log = [];

    const res = await getNudgeResponse();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cohorts.every((c) => c.told === 0 && c.moved === 0)).toBe(true);
    expect(h.builders.filter((b) => b.table === "nurse_profiles")).toHaveLength(
      0,
    );
  });

  it("reports a failed read of who was told, rather than nobody", async () => {
    h.state.logError = { message: "connection reset" };

    const res = await getNudgeResponse();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("connection reset");
  });

  it("reports a failed movement count, rather than nobody having moved", async () => {
    h.state.log = [told("a", "not_listed_nudge", "2026-09-04T14:50:00Z")];
    h.state.countError = { message: "permission denied" };

    const res = await getNudgeResponse();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("permission denied");
  });

  it("reports a count that came back null, rather than as zero", async () => {
    // A read that succeeded without a count is an absence of measurement, and
    // zero is the one value that reads as a real answer (L90).
    h.state.log = [told("a", "not_listed_nudge", "2026-09-04T14:50:00Z")];
    h.state.nullCount = true;

    const res = await getNudgeResponse();

    expect(res.ok).toBe(false);
  });

  it("refuses when the list of people told hit the row cap", async () => {
    // PostgREST caps a select and returns a healthy looking prefix, so a
    // cohort larger than the cap would be judged on its first page and the
    // proportion would be about a population nobody chose.
    // One more than the cap, which is what the read asks for so that hitting
    // it is detectable at all. Derived from the cap rather than restated, so
    // raising it cannot leave this test quietly checking the wrong number.
    h.state.log = Array.from({ length: TOLD_CAP + 1 }, (_, i) =>
      told(`n${i}`, "not_listed_nudge", "2026-09-04T14:50:00Z"),
    );

    const res = await getNudgeResponse();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/cap|complete/i);
  });
});
