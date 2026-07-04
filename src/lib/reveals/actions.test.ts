// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  const state = {
    user: { id: "fam-1", role: "family" } as {
      id: string;
      role: string;
    } | null,
    hasAccess: true,
    existingReveal: null as Record<string, unknown> | null,
    rateRow: {
      allowed: true,
      current_count: 0,
      needs_captcha: false,
    } as {
      allowed: boolean | null;
      current_count: number | null;
      needs_captcha: boolean | null;
    } | null,
    revealInsertError: null as unknown,
    contact: {
      email: "nurse@example.com",
      phone: "555-0100",
      communication_preference: "email",
    } as {
      email: string | null;
      phone: string | null;
      communication_preference: string | null;
    },
    captchaOk: true,
    rateLimitToday: null as {
      reveal_count: number;
      captcha_triggered: boolean;
      consecutive_captcha_days: number;
    } | null,
    rateLimitYesterday: null as {
      captcha_triggered: boolean;
      consecutive_captcha_days: number;
    } | null,
  };

  const calls = {
    revealInsert: [] as unknown[],
    rateLimitRpc: [] as unknown[],
    analyticsRpc: [] as unknown[],
    rateLimitUpdate: [] as unknown[],
    rateLimitInsert: [] as unknown[],
    verifyTurnstile: [] as unknown[],
  };

  function revealsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => ({ data: state.existingReveal });
    b.insert = async (payload: unknown) => {
      calls.revealInsert.push(payload);
      return { error: state.revealInsertError };
    };
    return b;
  }

  function rateLimitBuilder() {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return b;
    };
    b.maybeSingle = async () => {
      const row =
        filters.date === today ? state.rateLimitToday : state.rateLimitYesterday;
      return { data: row };
    };
    b.update = (payload: unknown) => {
      calls.rateLimitUpdate.push({ ...filters, payload });
      return { eq: () => ({ eq: async () => ({ error: null }) }) };
    };
    b.insert = async (payload: unknown) => {
      calls.rateLimitInsert.push(payload);
      return { error: null };
    };
    return b;
  }

  const serverClient = {
    from: (table: string) => {
      if (table === "reveals") return revealsBuilder();
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (fn: string, params: unknown) => {
      if (fn === "check_reveal_rate_limit") {
        calls.rateLimitRpc.push(params);
        return { single: async () => ({ data: state.rateRow }) };
      }
      if (fn === "increment_nurse_analytics") {
        calls.analyticsRpc.push(params);
        return Promise.resolve({ error: null });
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };

  const serviceRoleClient = {
    from: (table: string) => {
      if (table === "rate_limit_reveals") return rateLimitBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    today,
    yesterday,
    state,
    calls,
    serverClient,
    serviceRoleClient,
    getCurrentUser: vi.fn(async () => state.user),
    hasActiveFamilyAccess: vi.fn(async () => state.hasAccess),
    getNurseContactInfo: vi.fn(async () => state.contact),
    verifyTurnstileToken: vi.fn(async (token: string, ip?: string) => {
      calls.verifyTurnstile.push({ token, ip });
      return state.captchaOk;
    }),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "1.2.3.4" : null),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.serverClient,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.serviceRoleClient,
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: h.getCurrentUser }));
vi.mock("@/lib/subscriptions/queries", () => ({
  hasActiveFamilyAccess: h.hasActiveFamilyAccess,
}));
vi.mock("@/lib/profile/queries", () => ({
  getNurseContactInfo: h.getNurseContactInfo,
}));
vi.mock("@/lib/turnstile/verify", () => ({
  verifyTurnstileToken: h.verifyTurnstileToken,
}));

import { revealNurse, hasRevealedNurse } from "./actions";

const NURSE_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.user = { id: "fam-1", role: "family" };
  h.state.hasAccess = true;
  h.state.existingReveal = null;
  h.state.rateRow = { allowed: true, current_count: 0, needs_captcha: false };
  h.state.revealInsertError = null;
  h.state.contact = {
    email: "nurse@example.com",
    phone: "555-0100",
    communication_preference: "email",
  };
  h.state.captchaOk = true;
  h.state.rateLimitToday = null;
  h.state.rateLimitYesterday = null;
  h.calls.revealInsert = [];
  h.calls.rateLimitRpc = [];
  h.calls.analyticsRpc = [];
  h.calls.rateLimitUpdate = [];
  h.calls.rateLimitInsert = [];
  h.calls.verifyTurnstile = [];
});

describe("revealNurse gating", () => {
  it("blocks an unauthenticated visitor", async () => {
    h.state.user = null;
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "not_authenticated" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("blocks a non-family role", async () => {
    h.state.user = { id: "nurse-1", role: "nurse" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "wrong_role" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("blocks a family without active subscription access", async () => {
    h.state.hasAccess = false;
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "no_subscription" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });
});

describe("revealNurse idempotent re-reveal", () => {
  it("returns contact without bumping the rate limit or re-inserting", async () => {
    h.state.existingReveal = { id: "reveal-1" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: true, contact: h.state.contact });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.calls.rateLimitRpc).toHaveLength(0);
    expect(h.calls.rateLimitUpdate).toHaveLength(0);
    expect(h.calls.rateLimitInsert).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revealNurse rate-limit RPC coercion", () => {
  it("coerces a NULL rate-limit row to allowed with count 0 (regression: past NULL-coercion bug)", async () => {
    h.state.rateRow = null;
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.revealInsert).toHaveLength(1);
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({ reveal_count: 1, captcha_triggered: false }),
    ]);
  });

  it("blocks when the rate limit reports not allowed", async () => {
    h.state.rateRow = {
      allowed: false,
      current_count: 25,
      needs_captcha: true,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "rate_limited" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });
});

describe("revealNurse captcha gate", () => {
  beforeEach(() => {
    h.state.rateRow = {
      allowed: true,
      current_count: 10,
      needs_captcha: true,
    };
  });

  it("requires a captcha token when the threshold is hit", async () => {
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "needs_captcha" });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("rejects a failed captcha verification", async () => {
    h.state.captchaOk = false;
    const res = await revealNurse(NURSE_ID, "bad-token");
    expect(res).toEqual({ success: false, error: "captcha_failed" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("proceeds and bumps the captcha flag when verification succeeds", async () => {
    const res = await revealNurse(NURSE_ID, "good-token");
    expect(res.success).toBe(true);
    expect(h.verifyTurnstileToken).toHaveBeenCalledWith(
      "good-token",
      "1.2.3.4",
    );
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({ captcha_triggered: true }),
    ]);
  });
});

describe("revealNurse reveal insert failure", () => {
  it("returns unknown when the reveal insert errors", async () => {
    h.state.revealInsertError = { message: "db error" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.rateLimitInsert).toHaveLength(0);
  });
});

describe("revealNurse happy path", () => {
  it("inserts the reveal, bumps the rate limit, revalidates, and returns contact", async () => {
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: true, contact: h.state.contact });
    expect(h.calls.revealInsert).toEqual([
      { family_user_id: "fam-1", nurse_user_id: NURSE_ID },
    ]);
    expect(h.calls.analyticsRpc).toEqual([
      { p_nurse_user_id: NURSE_ID, p_field: "reveals" },
    ]);
    expect(h.revalidatePath).toHaveBeenCalledWith("/nurses");
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns unknown when the contact lookup comes back empty", async () => {
    h.state.contact = {
      email: null,
      phone: null,
      communication_preference: null,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
  });
});

describe("bumpRateLimit accounting (exercised via revealNurse)", () => {
  it("increments an existing today row instead of inserting a new one", async () => {
    h.state.rateLimitToday = {
      reveal_count: 3,
      captcha_triggered: false,
      consecutive_captcha_days: 0,
    };
    await revealNurse(NURSE_ID);
    expect(h.calls.rateLimitInsert).toHaveLength(0);
    expect(h.calls.rateLimitUpdate).toEqual([
      expect.objectContaining({
        payload: { reveal_count: 4, captcha_triggered: false },
      }),
    ]);
  });

  it("carries the consecutive-captcha streak forward from yesterday", async () => {
    h.state.rateRow = {
      allowed: true,
      current_count: 10,
      needs_captcha: true,
    };
    h.state.rateLimitYesterday = {
      captcha_triggered: true,
      consecutive_captcha_days: 2,
    };
    await revealNurse(NURSE_ID, "good-token");
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({
        captcha_triggered: true,
        consecutive_captcha_days: 3,
      }),
    ]);
  });

  it("starts the streak at 1 when yesterday had no captcha trigger", async () => {
    h.state.rateRow = {
      allowed: true,
      current_count: 10,
      needs_captcha: true,
    };
    h.state.rateLimitYesterday = {
      captcha_triggered: false,
      consecutive_captcha_days: 0,
    };
    await revealNurse(NURSE_ID, "good-token");
    expect(h.calls.rateLimitInsert).toEqual([
      expect.objectContaining({
        captcha_triggered: true,
        consecutive_captcha_days: 1,
      }),
    ]);
  });
});

describe("hasRevealedNurse", () => {
  it("is false for an unauthenticated visitor", async () => {
    h.state.user = null;
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });

  it("is false for a non-family role", async () => {
    h.state.user = { id: "nurse-1", role: "nurse" };
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });

  it("is false when there is no reveal row", async () => {
    h.state.existingReveal = null;
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });

  it("is true when access_expires_at is null (active, no expiry)", async () => {
    h.state.existingReveal = { access_expires_at: null };
    expect(await hasRevealedNurse(NURSE_ID)).toBe(true);
  });

  it("is true when access_expires_at is in the future", async () => {
    h.state.existingReveal = {
      access_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(await hasRevealedNurse(NURSE_ID)).toBe(true);
  });

  it("is false when access_expires_at is in the past", async () => {
    h.state.existingReveal = {
      access_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    };
    expect(await hasRevealedNurse(NURSE_ID)).toBe(false);
  });
});
