// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
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
    // Result of the atomic consume RPC. `allowed: false` means the row was
    // already at the hard cap, so the upsert's WHERE guard skipped the
    // increment.
    consumeRow: {
      allowed: true,
      current_count: 1,
      needs_captcha: false,
    } as {
      allowed: boolean | null;
      current_count: number | null;
      needs_captcha: boolean | null;
    } | null,
    consumeError: null as unknown,
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
  };

  const calls = {
    revealInsert: [] as unknown[],
    rateLimitRpc: [] as unknown[],
    consumeRpc: [] as unknown[],
    analyticsRpc: [] as unknown[],
    // Any direct table access from the service-role client. The atomic fix
    // means the counter is only ever touched through the RPC, so this must
    // stay empty.
    serviceRoleTables: [] as string[],
    verifyTurnstile: [] as unknown[],
  };

  function chainStub() {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert", "update", "maybeSingle"]) {
      b[m] = () => b;
    }
    return b;
  }

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
      calls.serviceRoleTables.push(table);
      return chainStub();
    },
    rpc: (fn: string, params: unknown) => {
      if (fn === "consume_reveal_rate_limit") {
        calls.consumeRpc.push(params);
        return {
          single: async () => ({
            data: state.consumeRow,
            error: state.consumeError,
          }),
        };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };

  return {
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
  h.state.consumeRow = { allowed: true, current_count: 1, needs_captcha: false };
  h.state.consumeError = null;
  h.state.revealInsertError = null;
  h.state.contact = {
    email: "nurse@example.com",
    phone: "555-0100",
    communication_preference: "email",
  };
  h.state.captchaOk = true;
  h.calls.revealInsert = [];
  h.calls.rateLimitRpc = [];
  h.calls.consumeRpc = [];
  h.calls.analyticsRpc = [];
  h.calls.serviceRoleTables = [];
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
  it("returns contact without consuming a rate-limit slot or re-inserting", async () => {
    h.state.existingReveal = { id: "reveal-1" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: true, contact: h.state.contact });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.calls.rateLimitRpc).toHaveLength(0);
    expect(h.calls.consumeRpc).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revealNurse advisory rate-limit check", () => {
  it("coerces a NULL rate-limit row to allowed with count 0 (regression: past NULL-coercion bug)", async () => {
    h.state.rateRow = null;
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.revealInsert).toHaveLength(1);
    expect(h.calls.consumeRpc).toEqual([
      { p_family_user_id: "fam-1", p_triggered_captcha: false },
    ]);
  });

  it("blocks early when the advisory check reports not allowed", async () => {
    h.state.rateRow = {
      allowed: false,
      current_count: 25,
      needs_captcha: true,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "rate_limited" });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.calls.consumeRpc).toHaveLength(0);
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

  it("rejects a failed captcha verification without consuming a slot", async () => {
    h.state.captchaOk = false;
    const res = await revealNurse(NURSE_ID, "bad-token");
    expect(res).toEqual({ success: false, error: "captcha_failed" });
    expect(h.calls.revealInsert).toHaveLength(0);
    // A failed captcha must not burn quota: consume runs only after verify.
    expect(h.calls.consumeRpc).toHaveLength(0);
  });

  it("passes the captcha trigger through to the consume RPC", async () => {
    const res = await revealNurse(NURSE_ID, "good-token");
    expect(res.success).toBe(true);
    expect(h.verifyTurnstileToken).toHaveBeenCalledWith(
      "good-token",
      "1.2.3.4",
    );
    expect(h.calls.consumeRpc).toEqual([
      { p_family_user_id: "fam-1", p_triggered_captcha: true },
    ]);
  });
});

describe("revealNurse atomic rate-limit consume (issue #563)", () => {
  it("consumes the slot through the RPC and never touches rate_limit_reveals directly", async () => {
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.consumeRpc).toEqual([
      { p_family_user_id: "fam-1", p_triggered_captcha: false },
    ]);
    // Read-modify-write is the bug. No direct table access at all.
    expect(h.calls.serviceRoleTables).toEqual([]);
  });

  it("denies the reveal when the atomic consume reports the cap is reached", async () => {
    // The advisory check passed (a concurrent request had not yet landed),
    // but the atomic upsert's WHERE guard refused to increment past the cap.
    h.state.consumeRow = {
      allowed: false,
      current_count: 25,
      needs_captcha: true,
    };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "rate_limited" });
    expect(h.calls.consumeRpc).toHaveLength(1);
    // Critical: the reveal must not be inserted once the cap is hit.
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("consumes the slot before inserting the reveal", async () => {
    h.state.consumeRow = {
      allowed: false,
      current_count: 25,
      needs_captcha: false,
    };
    await revealNurse(NURSE_ID);
    // A denied consume proves ordering: had the insert run first, it would
    // have been recorded before the deny short-circuited.
    expect(h.calls.revealInsert).toHaveLength(0);
  });

  it("fails loud and inserts nothing when the consume RPC errors", async () => {
    h.state.consumeRow = null;
    h.state.consumeError = { message: "db unavailable" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.revealInsert).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails loud when the consume RPC returns no row", async () => {
    h.state.consumeRow = null;
    h.state.consumeError = null;
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.revealInsert).toHaveLength(0);
  });
});

describe("revealNurse reveal insert failure", () => {
  it("returns unknown when the reveal insert errors", async () => {
    h.state.revealInsertError = { message: "db error" };
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: false, error: "unknown" });
    // Fail-closed: the slot is consumed before the insert, so a failed
    // insert burns quota rather than reopening the cap-bypass race.
    expect(h.calls.consumeRpc).toHaveLength(1);
  });
});

describe("revealNurse happy path", () => {
  it("inserts the reveal, consumes the limit, revalidates, and returns contact", async () => {
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
