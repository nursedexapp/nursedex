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
    // Result of the atomic reveal RPC (migration 059). `allowed: false` means
    // the family was already at the hard cap. `already_revealed: true` means the
    // reveal was already there, so the function spent nothing.
    revealRow: {
      allowed: true,
      current_count: 1,
      needs_captcha: false,
      already_revealed: false,
    } as {
      allowed: boolean | null;
      current_count: number | null;
      needs_captcha: boolean | null;
      already_revealed: boolean | null;
    } | null,
    revealError: null as unknown,
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
    // The app must never write the reveal row itself any more: spending the slot
    // and writing the reveal are one transaction inside reveal_nurse (#691), and
    // an insert out here would be back outside it.
    revealInsert: [] as unknown[],
    rateLimitRpc: [] as unknown[],
    revealRpc: [] as unknown[],
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
      calls.serviceRoleTables.push(table);
      return chainStub();
    },
    rpc: (fn: string, params: unknown) => {
      if (fn === "reveal_nurse") {
        calls.revealRpc.push(params);
        return {
          single: async () => ({
            data: state.revealRow,
            error: state.revealError,
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
  h.state.revealRow = {
    allowed: true,
    current_count: 1,
    needs_captcha: false,
    already_revealed: false,
  };
  h.state.revealError = null;
  h.state.contact = {
    email: "nurse@example.com",
    phone: "555-0100",
    communication_preference: "email",
  };
  h.state.captchaOk = true;
  h.calls.revealInsert = [];
  h.calls.rateLimitRpc = [];
  h.calls.revealRpc = [];
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
    expect(h.calls.revealRpc).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revealNurse advisory rate-limit check", () => {
  it("coerces a NULL rate-limit row to allowed with count 0 (regression: past NULL-coercion bug)", async () => {
    h.state.rateRow = null;
    const res = await revealNurse(NURSE_ID);
    expect(res.success).toBe(true);
    expect(h.calls.revealRpc).toEqual([
      {
        p_family_user_id: "fam-1",
        p_nurse_user_id: NURSE_ID,
        p_triggered_captcha: false,
      },
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
    expect(h.calls.revealRpc).toHaveLength(0);
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
    // A failed captcha must not burn quota: the reveal runs only after verify.
    expect(h.calls.revealRpc).toHaveLength(0);
  });

  it("passes the captcha trigger through to the reveal RPC", async () => {
    const res = await revealNurse(NURSE_ID, "good-token");
    expect(res.success).toBe(true);
    expect(h.verifyTurnstileToken).toHaveBeenCalledWith(
      "good-token",
      "1.2.3.4",
    );
    expect(h.calls.revealRpc).toEqual([
      {
        p_family_user_id: "fam-1",
        p_nurse_user_id: NURSE_ID,
        p_triggered_captcha: true,
      },
    ]);
  });
});

describe("revealNurse atomic reveal (issues #563, #691)", () => {
  it("spends the slot and writes the reveal in ONE call, never inserting the row itself", async () => {
    const res = await revealNurse(NURSE_ID);

    expect(res.success).toBe(true);
    expect(h.calls.revealRpc).toEqual([
      {
        p_family_user_id: "fam-1",
        p_nurse_user_id: NURSE_ID,
        p_triggered_captcha: false,
      },
    ]);
    // The bug was that spending the slot and writing the reveal were two round
    // trips: two attempts overlapping in the gap both paid, and the family lost
    // two of a capped daily allowance for one nurse (#691). An insert out here
    // would put the write back outside the transaction that protects it.
    expect(h.calls.revealInsert).toHaveLength(0);
    // Read-modify-write is the other bug. No direct table access at all.
    expect(h.calls.serviceRoleTables).toEqual([]);
  });

  it("denies the reveal when the atomic call reports the cap is reached", async () => {
    // The advisory check passed (a concurrent request had not yet landed), but
    // the atomic upsert's WHERE guard refused to increment past the cap.
    h.state.revealRow = {
      allowed: false,
      current_count: 25,
      needs_captcha: true,
      already_revealed: false,
    };

    const res = await revealNurse(NURSE_ID);

    expect(res).toEqual({ success: false, error: "rate_limited" });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a reveal that was already there as the success it is", async () => {
    // #653/#691. Two reveals of the SAME nurse racing each other both pass the
    // existing-reveal check above. The database now hands the loser's slot back
    // and reports already_revealed, and the family gets the contact they asked
    // for rather than a generic error toast over a reveal that worked.
    h.state.revealRow = {
      allowed: true,
      current_count: 1,
      needs_captcha: false,
      already_revealed: true,
    };

    const res = await revealNurse(NURSE_ID);

    expect(res).toEqual({ success: true, contact: h.state.contact });
  });

  it("fails loud and reveals nothing when the RPC errors", async () => {
    h.state.revealRow = null;
    h.state.revealError = { message: "db unavailable" };

    const res = await revealNurse(NURSE_ID);

    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails loud when the RPC returns no row", async () => {
    h.state.revealRow = null;
    h.state.revealError = null;

    const res = await revealNurse(NURSE_ID);

    expect(res).toEqual({ success: false, error: "unknown" });
  });

  it("fails closed when the RPC returns a NULL allowed", async () => {
    // An unknown counter state must deny the reveal, not grant it.
    h.state.revealRow = {
      allowed: null,
      current_count: null,
      needs_captcha: null,
      already_revealed: null,
    };

    const res = await revealNurse(NURSE_ID);

    expect(res).toEqual({ success: false, error: "rate_limited" });
  });
});

describe("revealNurse happy path", () => {
  it("reveals atomically, revalidates, and returns contact", async () => {
    const res = await revealNurse(NURSE_ID);
    expect(res).toEqual({ success: true, contact: h.state.contact });
    expect(h.calls.revealRpc).toHaveLength(1);
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
