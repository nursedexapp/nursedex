// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    sessionRetrieve: { subscription: "sub_1" } as
      | { subscription: string | null }
      | Error,
    subscriptionRows: [] as Array<{ id: string } | null | undefined>,
  };
  return { state };
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: async () => {
          if (h.state.sessionRetrieve instanceof Error) {
            throw h.state.sessionRetrieve;
          }
          return h.state.sessionRetrieve;
        },
      },
    },
  }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: h.state.subscriptionRows.shift() ?? null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";

function fakeRequest(qs: string): Parameters<typeof GET>[0] {
  const url = `https://nursedex.com/api/stripe/checkout-success${qs}`;
  return { nextUrl: new URL(url), url } as unknown as Parameters<typeof GET>[0];
}

async function runAndAdvance(qs: string) {
  const promise = GET(fakeRequest(qs));
  // Enough to cover the poll loop's worst case (3 delays x 750ms).
  await vi.advanceTimersByTimeAsync(3000);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.state.sessionRetrieve = { subscription: "sub_1" };
  h.state.subscriptionRows = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkout-success: open-redirect protection (#487)", () => {
  it("redirects to a safe same-origin next path", async () => {
    h.state.subscriptionRows = [{ id: "row_1" }];
    const res = await runAndAdvance("?next=%2Fdashboard%2Fsettings");

    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/dashboard/settings",
    );
  });

  it("falls back to /dashboard for a protocol-relative URL", async () => {
    h.state.subscriptionRows = [{ id: "row_1" }];
    const res = await runAndAdvance("?next=%2F%2Fevil.com");

    expect(res.headers.get("location")).toBe("https://nursedex.com/dashboard");
  });

  it("falls back to /dashboard for a next value that isn't a path", async () => {
    h.state.subscriptionRows = [{ id: "row_1" }];
    const res = await runAndAdvance(
      "?next=" + encodeURIComponent("https://evil.com"),
    );

    expect(res.headers.get("location")).toBe("https://nursedex.com/dashboard");
  });
});

describe("checkout-success: provisioning race (#426)", () => {
  it("redirects immediately when the subscription row already exists", async () => {
    h.state.subscriptionRows = [{ id: "row_1" }];
    const res = await runAndAdvance(
      "?session_id=cs_1&next=" + encodeURIComponent("/dashboard?subscribed=family"),
    );

    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/dashboard?subscribed=family",
    );
  });

  it("still redirects with the celebration intact once the row appears mid-poll", async () => {
    h.state.subscriptionRows = [null, null, { id: "row_1" }];
    const res = await runAndAdvance(
      "?session_id=cs_1&next=" + encodeURIComponent("/dashboard?subscribed=family"),
    );

    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/dashboard?subscribed=family",
    );
  });

  it("swaps subscribed=family for provisioning=pending when the row never appears in time", async () => {
    h.state.subscriptionRows = []; // every poll returns null
    const res = await runAndAdvance(
      "?session_id=cs_1&next=" + encodeURIComponent("/dashboard?subscribed=family"),
    );

    const location = res.headers.get("location");
    expect(location).toContain("provisioning=pending");
    expect(location).not.toContain("subscribed=family");
  });

  it("does not block the redirect if the Stripe session retrieve fails", async () => {
    h.state.sessionRetrieve = new Error("stripe unavailable");
    const res = await runAndAdvance(
      "?session_id=cs_1&next=" + encodeURIComponent("/dashboard?subscribed=family"),
    );

    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/dashboard?subscribed=family",
    );
  });

  it("skips polling entirely and redirects normally when there is no session_id", async () => {
    const res = await runAndAdvance(
      "?next=" + encodeURIComponent("/dashboard?subscribed=family"),
    );

    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/dashboard?subscribed=family",
    );
  });
});
