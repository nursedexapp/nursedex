// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const NURSE_ID = "22222222-2222-4222-8222-222222222222";
const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const REVIEW_ID = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; role: string; email: string } | null,
    reveal: null as Record<string, unknown> | null,
    // reviews.maybeSingle result: the dup-check row in submit, the target row
    // in update. The two flows are tested separately, so one field serves both.
    reviewLookup: null as Record<string, unknown> | null,
    insertError: null as { code?: string; message?: string } | null,
    insertedId: "review-new",
    updateError: null as { message?: string } | null,
    rpcError: null as { code?: string; message?: string } | null,
  };
  const calls = {
    insert: [] as Record<string, unknown>[],
    update: [] as Record<string, unknown>[],
    rpc: [] as { name: string; params: unknown }[],
  };

  function reviewsBuilder() {
    let pendingUpdate: Record<string, unknown> | null = null;
    return createQueryBuilder({
      maybeSingle: () => ({ data: state.reviewLookup }),
      insert: (payload) => {
        calls.insert.push(payload as Record<string, unknown>);
        return "chain";
      },
      single: () => ({
        data: state.insertError ? null : { id: state.insertedId },
        error: state.insertError,
      }),
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
      if (table === "reveals")
        return createQueryBuilder({
          maybeSingle: () => ({ data: state.reveal }),
        });
      if (table === "reviews") return reviewsBuilder();
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return Promise.resolve({ error: state.rpcError });
    },
  };

  return { state, calls, client, sendNewReviewEmail: vi.fn(async () => {}) };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client,
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => h.state.user,
}));
vi.mock("@/lib/email/send", () => ({
  sendNewReviewEmail: h.sendNewReviewEmail,
}));

import {
  submitFamilyReview,
  updateFamilyReview,
  requestReviewRemoval,
} from "./actions";

const VALID_REVIEW = {
  nurse_user_id: NURSE_ID,
  rating: 5,
  reviewer_name: "Dana",
  text: "This nurse was wonderful and attentive the whole visit.",
  testimonial_opt_in: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.user = { id: FAMILY_ID, role: "family", email: "fam@example.com" };
  h.state.reveal = null;
  h.state.reviewLookup = null;
  h.state.insertError = null;
  h.state.insertedId = "review-new";
  h.state.updateError = null;
  h.state.rpcError = null;
  h.calls.insert = [];
  h.calls.update = [];
  h.calls.rpc = [];
});

describe("submitFamilyReview", () => {
  it("returns not_authenticated when there is no user", async () => {
    h.state.user = null;
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "not_authenticated" });
    expect(h.calls.insert).toHaveLength(0);
  });

  it("returns wrong_role for a non-family user", async () => {
    h.state.user = { id: NURSE_ID, role: "nurse", email: "n@example.com" };
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "wrong_role" });
    expect(h.calls.insert).toHaveLength(0);
  });

  it("returns not_revealed when the family never revealed this nurse", async () => {
    h.state.reveal = null;
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "not_revealed" });
    expect(h.calls.insert).toHaveLength(0);
  });

  it("returns already_reviewed when a platform review already exists", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.reviewLookup = { id: "review-existing" };
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "already_reviewed" });
    expect(h.calls.insert).toHaveLength(0);
  });

  it("inserts a pending review and notifies the nurse on the happy path", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.reviewLookup = null;
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: true, reviewId: "review-new" });
    expect(h.calls.insert).toEqual([
      expect.objectContaining({
        nurse_user_id: NURSE_ID,
        reviewer_user_id: FAMILY_ID,
        is_external: false,
        email_verified: true,
        status: "pending",
      }),
    ]);
    expect(h.sendNewReviewEmail).toHaveBeenCalledTimes(1);
  });

  it("maps a unique-violation insert error to already_reviewed", async () => {
    h.state.reveal = { id: "reveal-1" };
    h.state.reviewLookup = null;
    h.state.insertError = { code: "23505" };
    const res = await submitFamilyReview(VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "already_reviewed" });
    expect(h.sendNewReviewEmail).not.toHaveBeenCalled();
  });
});

describe("updateFamilyReview", () => {
  it("returns not_found when the review belongs to another reviewer", async () => {
    h.state.reviewLookup = {
      id: REVIEW_ID,
      status: "pending",
      reviewer_user_id: "someone-else",
      nurse_user_id: NURSE_ID,
      is_external: false,
    };
    const res = await updateFamilyReview(REVIEW_ID, VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("returns not_found for an external review even if ids line up", async () => {
    h.state.reviewLookup = {
      id: REVIEW_ID,
      status: "pending",
      reviewer_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
      is_external: true,
    };
    const res = await updateFamilyReview(REVIEW_ID, VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("returns not_editable when the review is no longer pending", async () => {
    h.state.reviewLookup = {
      id: REVIEW_ID,
      status: "approved",
      reviewer_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
      is_external: false,
    };
    const res = await updateFamilyReview(REVIEW_ID, VALID_REVIEW);
    expect(res).toEqual({ success: false, error: "not_editable" });
    expect(h.calls.update).toHaveLength(0);
  });

  it("updates the owned pending review on the happy path", async () => {
    h.state.reviewLookup = {
      id: REVIEW_ID,
      status: "pending",
      reviewer_user_id: FAMILY_ID,
      nurse_user_id: NURSE_ID,
      is_external: false,
    };
    const res = await updateFamilyReview(REVIEW_ID, VALID_REVIEW);
    expect(res).toEqual({ success: true, reviewId: REVIEW_ID });
    expect(h.calls.update).toHaveLength(1);
  });
});

describe("requestReviewRemoval", () => {
  it("maps an RLS denial (42501) from the RPC to not_editable", async () => {
    h.state.rpcError = { code: "42501" };
    const res = await requestReviewRemoval({
      review_id: REVIEW_ID,
      reason: "This review is no longer accurate.",
    });
    expect(res).toEqual({ success: false, error: "not_editable" });
  });

  it("calls the request_review_removal RPC and succeeds", async () => {
    const res = await requestReviewRemoval({
      review_id: REVIEW_ID,
      reason: "This review is no longer accurate.",
    });
    expect(res).toEqual({ success: true, reviewId: REVIEW_ID });
    expect(h.calls.rpc).toEqual([
      { name: "request_review_removal", params: expect.any(Object) },
    ]);
  });
});
