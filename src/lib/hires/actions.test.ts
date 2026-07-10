// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
  const OTHER_FAMILY_ID = "44444444-4444-4444-8444-444444444444";
  const NURSE_ID = "22222222-2222-4222-8222-222222222222";
  const FAMILY_EMAIL = "family@example.com";

  const state = {
    actor: { id: FAMILY_ID, role: "family", first_name: "Fam" } as {
      id: string;
      role: string;
      first_name?: string;
    },
    tokenHireRow: null as Record<string, unknown> | null,
    hireUpdateError: null as unknown,
    family: null as Record<string, unknown> | null,
    nurseLookup: null as Record<string, unknown> | null,
    reveal: null as Record<string, unknown> | null,
    existingHire: null as Record<string, unknown> | null,
    recentEmailCount: 0,
    newHireId: "new-hire-1",
    hireInsertError: null as unknown,
  };

  const calls = {
    hireUpdate: [] as unknown[],
    hireInsert: [] as unknown[],
    familyHireInsert: [] as unknown[],
    claimTokenUpdate: [] as unknown[],
    emailLogInsert: [] as unknown[],
    cooldownQuery: [] as unknown[],
  };

  // The "hires" table is fetched via a fresh `.from("hires")` builder for
  // each query. A per-call `pendingUpdate` flag distinguishes the initial
  // `.select().eq().maybeSingle()` read from an `.update().eq().eq().select()`
  // write, and the write only applies (and returns a row) when every
  // accumulated .eq() filter, including the status precondition, still
  // matches the current state, modeling Postgres's atomic
  // UPDATE ... WHERE id = ? AND status = ? guard against a concurrent writer.
  function hiresServerBuilder() {
    let pendingUpdate: Record<string, unknown> | null = null;
    let updateFilters: Record<string, unknown> = {};
    return createQueryBuilder({
      // Token flows (confirm/reject) set tokenHireRow; recordFamilyHire's
      // duplicate check sets existingHire. The two flows never set both, so a
      // single builder serves both by preferring tokenHireRow.
      maybeSingle: () => ({
        data: state.tokenHireRow
          ? { ...state.tokenHireRow }
          : state.existingHire
            ? { ...state.existingHire }
            : null,
      }),
      // recordFamilyHire inserts a confirmed hire; select("id") then single()
      // return the new row (pendingUpdate stays null so select just chains).
      insert: (payload) => {
        calls.familyHireInsert.push(payload as Record<string, unknown>);
        return "chain";
      },
      single: () => ({
        data: state.hireInsertError ? null : { id: state.newHireId },
        error: state.hireInsertError,
      }),
      update: (payload) => {
        pendingUpdate = payload as Record<string, unknown>;
        updateFilters = {};
        return "chain";
      },
      eq: (...args) => {
        const [col, val] = args as [string, unknown];
        if (pendingUpdate) updateFilters[col] = val;
        return "chain";
      },
      select: () => {
        if (!pendingUpdate) return "chain";
        const payload = pendingUpdate;
        const filters = updateFilters;
        pendingUpdate = null;
        calls.hireUpdate.push({ filters, payload });
        const row = state.tokenHireRow;
        const matches =
          !!row &&
          Object.entries(filters).every(([col, val]) => row[col] === val);
        if (state.hireUpdateError) {
          return { data: null, error: state.hireUpdateError };
        }
        if (!matches) return { data: [], error: null };
        Object.assign(row as Record<string, unknown>, payload);
        return { data: [{ id: (row as { id: string }).id }], error: null };
      },
    });
  }

  const serverClient = {
    from: (table: string) => {
      if (table === "hires") return hiresServerBuilder();
      if (table === "reveals")
        return createQueryBuilder({
          maybeSingle: () => ({ data: state.reveal }),
        });
      throw new Error(`unexpected table ${table}`);
    },
  };

  function usersServiceBuilder() {
    const filters: Record<string, unknown> = {};
    return createQueryBuilder({
      eq: (...args) => {
        const [col, val] = args as [string, unknown];
        filters[col] = val;
        return "chain";
      },
      maybeSingle: () => ({
        data: "email" in filters ? state.family : state.nurseLookup,
      }),
    });
  }

  function revealsServiceBuilder() {
    return createQueryBuilder({ maybeSingle: () => ({ data: state.reveal }) });
  }

  function hiresServiceBuilder() {
    let pendingUpdate: Record<string, unknown> | null = null;
    return createQueryBuilder({
      maybeSingle: () => ({ data: state.existingHire }),
      insert: (payload) => {
        calls.hireInsert.push(payload as Record<string, unknown>);
        return "chain";
      },
      single: () => ({
        data: state.hireInsertError ? null : { id: state.newHireId },
        error: state.hireInsertError,
      }),
      update: (payload) => {
        pendingUpdate = payload as Record<string, unknown>;
        return "chain";
      },
      eq: () => {
        if (!pendingUpdate) return "chain";
        calls.claimTokenUpdate.push(pendingUpdate);
        pendingUpdate = null;
        return { error: null };
      },
    });
  }

  function emailLogServiceBuilder() {
    return createQueryBuilder({
      gte: (...args) => {
        const [col, val] = args as [string, unknown];
        calls.cooldownQuery.push({ col, val });
        return { count: state.recentEmailCount };
      },
      insert: (payload) => {
        calls.emailLogInsert.push(payload as Record<string, unknown>);
        return { error: null };
      },
    });
  }

  const serviceClient = {
    from: (table: string) => {
      if (table === "users") return usersServiceBuilder();
      if (table === "reveals") return revealsServiceBuilder();
      if (table === "hires") return hiresServiceBuilder();
      if (table === "email_log") return emailLogServiceBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    state,
    calls,
    serverClient,
    serviceClient,
    FAMILY_ID,
    OTHER_FAMILY_ID,
    NURSE_ID,
    FAMILY_EMAIL,
  };
});

const { FAMILY_ID, OTHER_FAMILY_ID, NURSE_ID, FAMILY_EMAIL } = h;
const TOKEN = "33333333-3333-4333-8333-333333333333";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.serverClient,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.serviceClient,
}));
vi.mock("@/lib/auth/helpers", () => ({
  requireRole: async () => h.state.actor,
}));
vi.mock("@/lib/email/send", () => ({
  sendHireConfirmRequestEmail: vi.fn(async () => {}),
  sendHireConfirmedEmail: vi.fn(async () => {}),
}));

import {
  confirmHireFromToken,
  rejectHireFromToken,
  claimHireByEmail,
  recordFamilyHire,
} from "./actions";
import { sendHireConfirmedEmail } from "@/lib/email/send";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.actor = { id: FAMILY_ID, role: "family", first_name: "Fam" };
  h.state.tokenHireRow = null;
  h.state.hireUpdateError = null;
  h.state.family = null;
  h.state.nurseLookup = null;
  h.state.reveal = null;
  h.state.existingHire = null;
  h.state.recentEmailCount = 0;
  h.state.newHireId = "new-hire-1";
  h.state.hireInsertError = null;
  h.calls.hireUpdate = [];
  h.calls.hireInsert = [];
  h.calls.familyHireInsert = [];
  h.calls.claimTokenUpdate = [];
  h.calls.emailLogInsert = [];
  h.calls.cooldownQuery = [];
});

describe("confirmHireFromToken", () => {
  it("returns not_found when the token belongs to a different family", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: OTHER_FAMILY_ID,
      nurse_user_id: NURSE_ID,
    };
    const res = await confirmHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.hireUpdate).toHaveLength(0);
  });

  it("returns wrong_state when the hire is not in claimed status", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "confirmed",
      family_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
    };
    const res = await confirmHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.hireUpdate).toHaveLength(0);
  });

  it("confirms a claimed hire and notifies the nurse", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
    };
    h.state.nurseLookup = { email: "nurse@example.com", first_name: "Nia" };
    const res = await confirmHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: true, hireId: "hire-1" });
    expect(h.calls.hireUpdate).toEqual([
      {
        filters: { id: "hire-1", status: "claimed" },
        payload: expect.objectContaining({ status: "confirmed" }),
      },
    ]);
  });

  it("only lets one of two concurrent confirmations succeed", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
    };
    h.state.nurseLookup = { email: "nurse@example.com", first_name: "Nia" };

    const [first, second] = await Promise.all([
      confirmHireFromToken({ token: TOKEN }),
      confirmHireFromToken({ token: TOKEN }),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toEqual([
      { success: false, error: "wrong_state" },
    ]);
    // Both requests attempt the guarded UPDATE; only one row-matching
    // attempt is allowed to actually flip the status.
    expect(h.calls.hireUpdate).toHaveLength(2);
    expect(sendHireConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("blocks a second confirm attempt on an already-confirmed hire (single-use token)", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
    };
    h.state.nurseLookup = { email: "nurse@example.com", first_name: "Nia" };

    const first = await confirmHireFromToken({ token: TOKEN });
    expect(first.success).toBe(true);

    const second = await confirmHireFromToken({ token: TOKEN });
    expect(second).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.hireUpdate).toHaveLength(1);
  });
});

describe("rejectHireFromToken", () => {
  it("returns not_found when the token belongs to a different family", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: OTHER_FAMILY_ID,
    };
    const res = await rejectHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.hireUpdate).toHaveLength(0);
  });

  it("returns wrong_state when the hire is not in claimed status", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "rejected",
      family_user_id: FAMILY_ID,
    };
    const res = await rejectHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.hireUpdate).toHaveLength(0);
  });

  it("rejects a claimed hire", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: FAMILY_ID,
    };
    const res = await rejectHireFromToken({ token: TOKEN });
    expect(res).toEqual({ success: true, hireId: "hire-1" });
    expect(h.calls.hireUpdate).toEqual([
      {
        filters: { id: "hire-1", status: "claimed" },
        payload: { status: "rejected" },
      },
    ]);
  });

  it("only lets one of two concurrent rejections succeed", async () => {
    h.state.tokenHireRow = {
      id: "hire-1",
      status: "claimed",
      family_user_id: FAMILY_ID,
    };

    const [first, second] = await Promise.all([
      rejectHireFromToken({ token: TOKEN }),
      rejectHireFromToken({ token: TOKEN }),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toEqual([
      { success: false, error: "wrong_state" },
    ]);
    expect(h.calls.hireUpdate).toHaveLength(2);
  });
});

describe("claimHireByEmail", () => {
  beforeEach(() => {
    h.state.actor = { id: NURSE_ID, role: "nurse", first_name: "Nia" };
    h.state.family = {
      id: FAMILY_ID,
      email: FAMILY_EMAIL,
      first_name: "Fam",
      role: "family",
      is_deleted: false,
      is_suspended: false,
    };
    h.state.reveal = { id: "reveal-1" };
  });

  it("blocks a resend within the cooldown window", async () => {
    h.state.existingHire = {
      id: "hire-1",
      status: "claimed",
      claimed_by: "nurse",
      claim_token: TOKEN,
    };
    h.state.recentEmailCount = 1;
    const res = await claimHireByEmail({ family_email: FAMILY_EMAIL });
    expect(res).toEqual({ success: false, error: "too_soon" });
    expect(h.calls.emailLogInsert).toHaveLength(0);
    expect(h.calls.claimTokenUpdate).toHaveLength(0);
  });

  it("resends the existing claim token outside the cooldown window", async () => {
    h.state.existingHire = {
      id: "hire-1",
      status: "claimed",
      claimed_by: "nurse",
      claim_token: TOKEN,
    };
    h.state.recentEmailCount = 0;
    const res = await claimHireByEmail({ family_email: FAMILY_EMAIL });
    expect(res).toEqual({ success: true, hireId: "hire-1", resent: true });
    expect(h.calls.claimTokenUpdate).toHaveLength(0);
    expect(h.calls.emailLogInsert).toEqual([
      expect.objectContaining({
        recipient_user_id: FAMILY_ID,
        email_type: "hire_confirm_request",
        dedup_key: "hire-1",
      }),
    ]);
  });

  it("inserts a new claim with a token and logs the send on the happy path", async () => {
    h.state.existingHire = null;
    const res = await claimHireByEmail({ family_email: FAMILY_EMAIL });
    expect(res.success).toBe(true);
    expect(res.hireId).toBe(h.state.newHireId);
    expect(h.calls.hireInsert).toEqual([
      expect.objectContaining({
        family_user_id: FAMILY_ID,
        nurse_user_id: NURSE_ID,
        status: "claimed",
        claimed_by: "nurse",
        claim_token: expect.stringMatching(
          /^[0-9a-f-]{36}$/i,
        ) as unknown as string,
      }),
    ]);
    expect(h.calls.emailLogInsert).toEqual([
      expect.objectContaining({
        recipient_user_id: FAMILY_ID,
        email_type: "hire_confirm_request",
        dedup_key: h.state.newHireId,
      }),
    ]);
  });
});

describe("recordFamilyHire", () => {
  it("returns invalid for a malformed nurse_user_id without touching the DB", async () => {
    const res = await recordFamilyHire({ nurse_user_id: "not-a-uuid" });
    expect(res).toEqual({ success: false, error: "invalid" });
    expect(h.calls.familyHireInsert).toHaveLength(0);
  });

  it("returns not_revealed when the family never revealed this nurse", async () => {
    h.state.reveal = null;
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res).toEqual({ success: false, error: "not_revealed" });
    expect(h.calls.familyHireInsert).toHaveLength(0);
  });

  it("returns already_recorded on an existing confirmed hire", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.existingHire = { id: "hire-1", status: "confirmed" };
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res).toEqual({ success: false, error: "already_recorded" });
    expect(h.calls.familyHireInsert).toHaveLength(0);
  });

  it("allows re-recording after a prior rejected hire", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.existingHire = { id: "hire-1", status: "rejected" };
    h.state.nurseLookup = { email: "nurse@example.com", first_name: "Nia" };
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res).toEqual({ success: true, hireId: h.state.newHireId });
    expect(h.calls.familyHireInsert).toHaveLength(1);
  });

  it("inserts a confirmed family-claimed hire and queues the nurse email on the happy path", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.existingHire = null;
    h.state.nurseLookup = { email: "nurse@example.com", first_name: "Nia" };
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res).toEqual({ success: true, hireId: h.state.newHireId });
    expect(h.calls.familyHireInsert).toEqual([
      expect.objectContaining({
        family_user_id: FAMILY_ID,
        nurse_user_id: NURSE_ID,
        status: "confirmed",
        claimed_by: "family",
      }),
    ]);
    expect(sendHireConfirmedEmail).toHaveBeenCalledTimes(1);
    expect(sendHireConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "nurse@example.com", firstName: "Nia" }),
    );
  });

  it("still succeeds without sending email when the nurse has no email on file", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.existingHire = null;
    h.state.nurseLookup = null;
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res.success).toBe(true);
    expect(sendHireConfirmedEmail).not.toHaveBeenCalled();
  });

  it("returns unknown when the hire insert fails", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.existingHire = null;
    h.state.hireInsertError = { message: "insert boom" };
    const res = await recordFamilyHire({ nurse_user_id: NURSE_ID });
    expect(res).toEqual({ success: false, error: "unknown" });
    expect(sendHireConfirmedEmail).not.toHaveBeenCalled();
  });
});
