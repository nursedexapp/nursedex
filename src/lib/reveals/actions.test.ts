// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    user: { id: "fam-1", role: "family" } as
      | { id: string; role: string }
      | null,
    hasAccess: true,
    existingReveal: null as { id: string } | null,
    rateRow: null as {
      allowed: boolean | null;
      current_count: number | null;
      needs_captcha: boolean | null;
    } | null,
    insertError: null as { message: string } | null,
    contact: {
      email: "nurse@example.com",
      phone: "555-0100",
      communication_preference: "email",
    } as {
      email: string | null;
      phone: string | null;
      communication_preference: string | null;
    },
    turnstileOk: true,
    rateLimitRows: {} as Record<
      string,
      {
        reveal_count: number;
        captcha_triggered: boolean;
        consecutive_captcha_days: number;
      }
    >,
  };
  const calls = {
    revealInsert: [] as unknown[],
    rateLimitInsert: [] as unknown[],
    rateLimitUpdate: [] as unknown[],
    analyticsRpc: [] as unknown[],
  };

  function revealsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = () => Promise.resolve({ data: state.existingReveal });
    b.insert = (payload: unknown) => {
      calls.revealInsert.push(payload);
      return Promise.resolve({ error: state.insertError });
    };
    return b;
  }

  function rateLimitBuilder() {
    let lookupDate: string | undefined;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: string) => {
      if (col === "date") lookupDate = val;
      return b;
    };
    b.maybeSingle = () =>
      Promise.resolve({
        data: lookupDate ? (state.rateLimitRows[lookupDate] ?? null) : null,
      });
    b.update = (payload: Record<string, unknown>) => {
      calls.rateLimitUpdate.push(payload);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    };
    b.insert = (payload: unknown) => {
      calls.rateLimitInsert.push(payload);
      return Promise.resolve({ error: null });
    };
    return b;
  }

  function clientFrom(table: string) {
    if (table === "reveals") return revealsBuilder();
    if (table === "rate_limit_reveals") return rateLimitBuilder();
    throw new Error(`unexpected table: ${table}`);
  }

  return { state, calls, clientFrom };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-forwarded-for" ? "9.9.9.9" : null),
  }),
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => h.state.user,
}));
vi.mock("@/lib/subscriptions/queries", () => ({
  hasActiveFamilyAccess: async () => h.state.hasAccess,
}));
vi.mock("@/lib/profile/queries", () => ({
  getNurseContactInfo: async () => h.state.contact,
}));
vi.mock("@/lib/turnstile/verify", () => ({
  verifyTurnstileToken: async () => h.state.turnstileOk,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => h.clientFrom(table),
    rpc: (name: string) => {
      if (name === "check_reveal_rate_limit") {
        return { single: () => Promise.resolve({ data: h.state.rateRow }) };
      }
      if (name === "increment_nurse_analytics") {
        h.calls.analyticsRpc.push(name);
        return { then: (onFulfilled: () => void) => onFulfilled() };
      }
      throw new Error(`unexpected rpc: ${name}`);
    },
  }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => h.clientFrom(table),
  }),
}));

import { revealNurse, hasRevealedNurse } from "./actions";

const NURSE_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.user = { id: "fam-1", role: "family" };
  h.state.hasAccess = true;
  h.state.existingReveal = null;
  h.state.rateRow = { allowed: true, current_count: 0, needs_captcha: false };
  h.state.insertError = null;
  h.state.contact = {
    email: "nurse@example.com",
    phone: "555-0100",
    communication_preference: "email",
  };
  h.state.turnstileOk = true;
  h.state.rateLimitRows = {};
  h.calls.revealInsert = [];
  h.calls.rateLimitInsert = [];
  h.calls.rateLimitUpdate = [];
  h.calls.analyticsRpc = [];
});

describe("revealNurse", () => {
  it("blocks an unauthenticated user", async () => {
    h.state.user = null;
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "not_authenticated" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("blocks a non-family user", async () => {
    h.state.user = { id: "nurse-1", role: "nurse" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "wrong_role" });
  });

  it("blocks a family user with no active subscription", async () => {
    h.state.hasAccess = false;
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "no_subscription" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("is idempotent: an already-revealed nurse returns contact without bumping the rate limit", async () => {
    h.state.existingReveal = { id: "reveal-1" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({
      success: true,
      contact: h.state.contact,
    });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.calls.rateLimitInsert).toHaveLength(0);
    expect(h.calls.rateLimitUpdate).toHaveLength(0);
  });

  it("coerces a NULL rate-limit RPC row to allowed with count 0", async () => {
    h.state.rateRow = null;
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.revealInsert).toHaveLength(1);
    // No captcha requested since needs_captcha coerces to false.
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({ captcha_triggered: false }),
    ]);
  });

  it("blocks when the rate limit RPC reports not allowed", async () => {
    h.state.rateRow = { allowed: false, current_count: 12, needs_captcha: false };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "rate_limited" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("requires a captcha token when needs_captcha is true and none is provided", async () => {
    h.state.rateRow = { allowed: true, current_count: 5, needs_captcha: true };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "needs_captcha" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("fails the reveal when the captcha token does not verify", async () => {
    h.state.rateRow = { allowed: true, current_count: 5, needs_captcha: true };
    h.state.turnstileOk = false;
    const res = await revealNurse(NURSE_ID, "bad-token");
    expect(res).toEqual({ success: false, error: "captcha_failed" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("succeeds and bumps the counter with captcha_triggered when captcha passes", async () => {
    h.state.rateRow = { allowed: true, current_count: 5, needs_captcha: true };
    h.state.turnstileOk = true;
    const res = await revealNurse(NURSE_ID, "good-token");
    expect(res.success).toBe(true);
    expect(h.calls.revealInsert).toHaveLength(1);
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({ captcha_triggered: true, consecutive_captcha_days: 1 }),
    ]);
  });

  it("carries the consecutive captcha streak forward from yesterday's row", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    h.state.rateLimitRows[yesterdayStr] = {
      reveal_count: 3,
      captcha_triggered: true,
      consecutive_captcha_days: 2,
    };
    h.state.rateRow = { allowed: true, current_count: 5, needs_captcha: true };
    const res = await revealNurse(NURSE_ID, "good-token");
    expect(res.success).toBe(true);
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({
        date: today,
        captcha_triggered: true,
        consecutive_captcha_days: 3,
      }),
    ]);
  });

  it("increments an existing today row instead of inserting a new one", async () => {
    const today = new Date().toISOString().slice(0, 10);
    h.state.rateLimitRows[today] = {
      reveal_count: 4,
      captcha_triggered: false,
      consecutive_captcha_days: 0,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.rateLimitInsert).toHaveLength(0);
    expect(h.calls.rateLimitUpdate).toEqual([
      expect.objectContaining({ reveal_count: 5, captcha_triggered: false }),
    ]);
  });

  it("returns unknown when the reveal insert fails", async () => {
    h.state.insertError = { message: "duplicate key" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.rateLimitInsert).toHaveLength(0);
  });

  it("returns unknown when the contact lookup comes back empty after a successful reveal", async () => {
    h.state.contact = {
      email: null,
      phone: null,
      communication_preference: null,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.revealInsert).toHaveLength(1);
  });
});

describe("hasRevealedNurse", () => {
  it("is false for an unauthenticated user", async () => {
    h.state.user = null;
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });

  it("is false for a non-family user", async () => {
    h.state.user = { id: "nurse-1", role: "nurse" };
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });
});
