// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #715. Whether a person has asked not to be tracked.
 *
 * The interesting half is the FAILURE path. This lookup decides whether an
 * event is sent to a third party, so when it cannot answer, the two possible
 * defaults are not equivalent: sending anyway means tracking somebody who may
 * have refused, and not sending means losing an event. A control that exists
 * to protect a person fails closed, so a lookup that errors is treated as an
 * opt-out, and it says so loudly rather than silently.
 */
const h = vi.hoisted(() => ({
  result: {
    data: null as { analytics_opt_out: boolean } | null,
    error: null as unknown,
  },
  throwOnClient: false,
  queries: [] as { table: string; id: string }[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    if (h.throwOnClient) throw new Error("no service role key");
    return {
      from: (table: string) => ({
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => {
              h.queries.push({ table, id });
              return h.result;
            },
          }),
        }),
      }),
    };
  },
}));

import { hasOptedOutOfAnalytics } from "./opt-out";

beforeEach(() => {
  h.result = { data: { analytics_opt_out: false }, error: null };
  h.throwOnClient = false;
  h.queries.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("hasOptedOutOfAnalytics", () => {
  it("says no for somebody who has not opted out", async () => {
    h.result = { data: { analytics_opt_out: false }, error: null };
    expect(await hasOptedOutOfAnalytics("user-1")).toBe(false);
    // Asserted so the negative cases below cannot pass against a lookup that
    // never ran at all.
    expect(h.queries).toEqual([{ table: "users", id: "user-1" }]);
  });

  it("says yes for somebody who has opted out", async () => {
    h.result = { data: { analytics_opt_out: true }, error: null };
    expect(await hasOptedOutOfAnalytics("user-1")).toBe(true);
  });

  it("fails closed when the lookup errors", async () => {
    h.result = { data: null, error: { message: "connection reset" } };
    expect(await hasOptedOutOfAnalytics("user-1")).toBe(true);
  });

  it("fails closed when the client cannot even be built", async () => {
    // A missing service-role key throws rather than returning an error, and
    // that path reaches a different line, so it gets its own case.
    h.throwOnClient = true;
    expect(await hasOptedOutOfAnalytics("user-1")).toBe(true);
  });

  it("fails closed for a user id that matches no row", async () => {
    // No row is not "has not opted out": it is a distinctId this lookup cannot
    // speak for, and guessing in the sending direction is the wrong guess.
    h.result = { data: null, error: null };
    expect(await hasOptedOutOfAnalytics("ghost"), "unknown user").toBe(true);
  });

  it("names the missing column, because that failure has one fix", async () => {
    // The deploy window: production runs the new code from the moment a PR
    // merges, and the migration is applied by hand afterwards. In between,
    // this lookup fails and correctly refuses to send anything, so ALL
    // server-side analytics stops. That is the right behaviour and an
    // alarming symptom, so the log has to say which of the many reasons a
    // query can fail this one is, and what clears it.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.result = {
      data: null,
      error: {
        code: "42703",
        message: 'column "analytics_opt_out" does not exist',
      },
    };
    expect(await hasOptedOutOfAnalytics("user-1")).toBe(true);
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toMatch(/migration/i);
    expect(logged).toMatch(/068/);
  });

  it("reports a failed lookup instead of swallowing it", async () => {
    // Failing closed is silent by nature: events simply stop. Without a log, a
    // broken lookup looks exactly like an audience that went quiet.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.result = { data: null, error: { message: "connection reset" } };
    await hasOptedOutOfAnalytics("user-1");
    expect(error).toHaveBeenCalled();
  });
});
