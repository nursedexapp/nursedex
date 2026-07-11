// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const NURSE_ID = "22222222-2222-4222-8222-222222222222";
const REVIEW_ID = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => {
  const state = {
    // Literal, not NURSE_ID: vi.hoisted runs before the top-level consts.
    actor: { id: "22222222-2222-4222-8222-222222222222" } as { id: string },
    reviewRow: null as Record<string, unknown> | null,
    updateError: null as { message?: string } | null,
    rpcError: null as { code?: string; message?: string } | null,
    profane: false,
  };
  const calls = {
    update: [] as Record<string, unknown>[],
    rpc: [] as { name: string; params: unknown }[],
  };

  function reviewsBuilder() {
    let pendingUpdate: Record<string, unknown> | null = null;
    return createQueryBuilder({
      maybeSingle: () => ({ data: state.reviewRow }),
      update: (payload) => {
        pendingUpdate = payload as Record<string, unknown>;
        return "chain";
      },
      eq: () => {
        if (!pendingUpdate) return "chain";
        calls.update.push(pendingUpdate);
        pendingUpdate = null;
        return { error: state.updateError };
      },
    });
  }

  const client = {
    from: (table: string) => {
      if (table === "reviews") return reviewsBuilder();
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return Promise.resolve({ error: state.rpcError });
    },
  };

  return {
    state,
    calls,
    client,
    containsProfanity: vi.fn((_text: string) => false),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client,
}));
vi.mock("@/lib/auth/helpers", () => ({
  requireRole: async () => h.state.actor,
}));
vi.mock("./profanity", () => ({
  containsProfanity: (text: string) => h.containsProfanity(text),
}));

import {
  saveNurseResponse,
  disputeReview,
  deleteNurseResponse,
} from "./nurse-actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.actor = { id: NURSE_ID };
  h.state.reviewRow = null;
  h.state.updateError = null;
  h.state.rpcError = null;
  h.containsProfanity.mockReturnValue(false);
  h.calls.update = [];
  h.calls.rpc = [];
});

describe("saveNurseResponse", () => {
  it("returns profanity and never writes when the response is profane", async () => {
    h.containsProfanity.mockReturnValue(true);
    const res = await saveNurseResponse({
      review_id: REVIEW_ID,
      text: "some text",
    });
    expect(res.error).toBe("profanity");
    expect(h.calls.update).toHaveLength(0);
  });

  it("returns not_found when the review is not owned by this nurse", async () => {
    h.state.reviewRow = { id: REVIEW_ID, nurse_user_id: "another-nurse" };
    const res = await saveNurseResponse({
      review_id: REVIEW_ID,
      text: "Thanks for the kind words.",
    });
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("returns not_found when the review does not exist", async () => {
    h.state.reviewRow = null;
    const res = await saveNurseResponse({
      review_id: REVIEW_ID,
      text: "Thanks for the kind words.",
    });
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("saves the response on an owned review", async () => {
    h.state.reviewRow = { id: REVIEW_ID, nurse_user_id: NURSE_ID };
    const res = await saveNurseResponse({
      review_id: REVIEW_ID,
      text: "Thanks for the kind words.",
    });
    expect(res).toEqual({ success: true });
    expect(h.calls.update).toEqual([
      expect.objectContaining({ nurse_response: "Thanks for the kind words." }),
    ]);
  });
});

describe("disputeReview", () => {
  it("maps an RLS denial (42501) from the RPC to not_eligible", async () => {
    h.state.rpcError = { code: "42501" };
    const res = await disputeReview({
      review_id: REVIEW_ID,
      reason: "Factually inaccurate",
    });
    expect(res).toEqual({ success: false, error: "not_eligible" });
  });

  it("calls the dispute_review RPC and succeeds", async () => {
    const res = await disputeReview({
      review_id: REVIEW_ID,
      reason: "Factually inaccurate",
    });
    expect(res).toEqual({ success: true });
    expect(h.calls.rpc).toEqual([
      { name: "dispute_review", params: expect.any(Object) },
    ]);
  });

  it("returns unknown on an unexpected RPC error", async () => {
    h.state.rpcError = { code: "XX000", message: "boom" };
    const res = await disputeReview({
      review_id: REVIEW_ID,
      reason: "Factually inaccurate",
    });
    expect(res).toEqual({ success: false, error: "unknown" });
  });
});

describe("deleteNurseResponse", () => {
  it("returns not_found when the review is not owned by this nurse", async () => {
    h.state.reviewRow = { id: REVIEW_ID, nurse_user_id: "another-nurse" };
    const res = await deleteNurseResponse(REVIEW_ID);
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("clears the response on an owned review", async () => {
    h.state.reviewRow = { id: REVIEW_ID, nurse_user_id: NURSE_ID };
    const res = await deleteNurseResponse(REVIEW_ID);
    expect(res).toEqual({ success: true });
    expect(h.calls.update).toEqual([
      { nurse_response: null, nurse_response_at: null },
    ]);
  });
});
