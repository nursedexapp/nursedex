// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createQueryBuilder,
  type QueryBuilderHandlers,
} from "../../../test/supabase-mock";
import { applyListedNurseFilter } from "@/lib/nurses/visibility";
import { COMPLETENESS_FIELDS } from "@/lib/profile/completeness";
import { readScoredProfiles } from "./completeness";

/**
 * The stored completeness score is read in one place: ordering the directory.
 * A nurse the directory does not list is ranked against nobody, so a score on
 * her that disagrees with the rule affects nobody either.
 *
 * Judging every profile made the weekly drift alert fire on nurses who simply
 * had not finished signing up (2026-09-14: the only drifted row was a pending
 * signup with every field empty), which is expected and needs no person. So
 * the read is the directory's own population, taken through the directory's
 * own filter rather than a second copy of its conditions.
 */

type Call = [method: string, ...args: unknown[]];
type Page = { data?: unknown[] | null; error?: unknown; count?: number | null };

const FILTER_METHODS = ["eq", "neq", "or", "not", "in", "is"];

/** Each query the reader built, as the calls made on it, answering in turn. */
function recordingClient(pages: Page[]) {
  const queries: Call[][] = [];
  const ranges: Array<[unknown, unknown]> = [];
  let next = 0;

  const client = {
    from: (table: string) => {
      const calls: Call[] = [["from", table]];
      queries.push(calls);
      const handlers: QueryBuilderHandlers = {};
      for (const method of [...FILTER_METHODS, "select", "order"]) {
        handlers[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return "chain";
        };
      }
      handlers.range = (from: unknown, to: unknown) => {
        ranges.push([from, to]);
        const page = pages[next++];
        if (!page) throw new Error("the reader asked for more pages than exist");
        return {
          data: page.data ?? null,
          error: page.error ?? null,
          count: page.count === undefined ? null : page.count,
        };
      };
      return createQueryBuilder(handlers);
    },
  } as unknown as SupabaseClient;

  return { client, queries, ranges };
}

/** The filter calls applyListedNurseFilter makes, read from the filter itself. */
function listedFilterCalls(): Call[] {
  const calls: Call[] = [];
  const handlers: QueryBuilderHandlers = {};
  for (const method of FILTER_METHODS) {
    handlers[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return "chain";
    };
  }
  applyListedNurseFilter(createQueryBuilder(handlers));
  return calls;
}

const row = (user_id: string) => ({
  user_id,
  profile_completeness: 10,
  photos: [],
  bio: null,
  skills: [],
  care_philosophy: null,
  availability_commitment: [],
  time_slots: [],
  rate_min: null,
  rate_max: null,
  has_transportation: false,
  covid_vaccinated: null,
  travel_radius_miles: null,
});

describe("readScoredProfiles", () => {
  it("judges only the nurses the directory lists", async () => {
    const expected = listedFilterCalls();
    // The premise: a filter that applied nothing would make any reader pass.
    expect(expected.length).toBeGreaterThan(0);

    const { client, queries } = recordingClient([{ data: [row("a")], count: 1 }]);
    await readScoredProfiles({ client });

    expect(queries).toHaveLength(1);
    expect(queries[0][0]).toEqual(["from", "nurse_profiles"]);
    const applied = queries[0].filter(([m]) => FILTER_METHODS.includes(m));
    expect(applied).toEqual(expected);
  });

  it("reads every scored field and the owner the listing rule checks", async () => {
    const { client, queries } = recordingClient([{ data: [row("a")], count: 1 }]);
    await readScoredProfiles({ client });

    const select = queries[0].find(([m]) => m === "select");
    const columns = String(select?.[1]);
    // Inner, or a nurse whose owner is deleted or suspended would be counted.
    expect(columns).toContain("users!inner(is_deleted, is_suspended)");
    expect(columns).toContain("profile_completeness");
    for (const field of COMPLETENESS_FIELDS) expect(columns).toContain(field);
    expect(select?.[2]).toMatchObject({ count: "exact" });
  });

  it("pages in a fixed order until the roster is complete", async () => {
    const { client, queries, ranges } = recordingClient([
      { data: [row("a"), row("b")], count: 3 },
      { data: [row("c")], count: 3 },
    ]);

    const rows = await readScoredProfiles({ client, pageSize: 2 });

    expect(rows.map((r) => r.user_id)).toEqual(["a", "b", "c"]);
    expect(ranges).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // Without an order, a row can move between pages and be read twice or
    // never, and the count check would not notice a swap.
    for (const q of queries) {
      expect(q.some(([m, col]) => m === "order" && col === "user_id")).toBe(true);
    }
  });

  it("refuses a read that did not say how many rows there are", async () => {
    const { client } = recordingClient([{ data: [row("a")], count: null }]);

    await expect(readScoredProfiles({ client })).rejects.toThrow(
      /did not report how many/,
    );
  });

  it("refuses a roster shorter than the count the server reported", async () => {
    const { client } = recordingClient([{ data: [row("a")], count: 2 }]);

    await expect(readScoredProfiles({ client })).rejects.toThrow(
      /Read 1 profiles but the server reports 2/,
    );
  });

  it("fails on a read error rather than judging nothing", async () => {
    const { client } = recordingClient([
      { error: { message: "connection reset" } },
    ]);

    await expect(readScoredProfiles({ client })).rejects.toThrow(
      /connection reset/,
    );
  });
});
