// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const NURSE_ID = "22222222-2222-4222-8222-222222222222";
const LINK_TOKEN = "44444444-4444-4444-8444-444444444444";
const VERIFY_TOKEN = "55555555-5555-4555-8555-555555555555";

const h = vi.hoisted(() => {
  const state = {
    actor: { id: "22222222-2222-4222-8222-222222222222" } as { id: string },
    // rpc-by-name results, each awaited via .single().
    rpc: {} as Record<string, { data: unknown; error: unknown }>,
    linkExisting: null as Record<string, unknown> | null,
    linkCreated: { token: "tok-new", last_regenerated_at: "t0" } as Record<
      string,
      unknown
    > | null,
    linkCreateError: null as unknown,
    regen: { data: null as unknown, error: null as unknown },
  };
  const calls = {
    rpc: [] as { name: string; params: unknown }[],
    linkInsert: [] as unknown[],
  };

  const serverClient = {
    from: (table: string) => {
      if (table === "nurse_review_links")
        return createQueryBuilder({
          maybeSingle: () => ({ data: state.linkExisting }),
          insert: (payload) => {
            calls.linkInsert.push(payload);
            return "chain";
          },
          single: () => ({
            data: state.linkCreateError ? null : state.linkCreated,
            error: state.linkCreateError,
          }),
        });
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return createQueryBuilder({
        single: () => state.rpc[name] ?? { data: null, error: null },
      });
    },
  };

  const serviceClient = {
    from: (table: string) => {
      if (table === "nurse_review_links")
        return createQueryBuilder({ maybeSingle: () => state.regen });
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    state,
    calls,
    serverClient,
    serviceClient,
    sendVerifyReviewEmail: vi.fn(async () => {}),
    sendNewReviewEmail: vi.fn(async () => {}),
  };
});

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
  sendVerifyReviewEmail: h.sendVerifyReviewEmail,
  sendNewReviewEmail: h.sendNewReviewEmail,
}));

import {
  getOrCreateReviewLink,
  regenerateReviewLink,
  submitExternalReview,
  verifyExternalReview,
} from "./external-actions";

const VALID_EXTERNAL = {
  link_token: LINK_TOKEN,
  rating: 5,
  reviewer_name: "Sam",
  reviewer_email: "sam@example.com",
  text: "This nurse was fantastic and very professional throughout.",
  testimonial_opt_in: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.actor = { id: NURSE_ID };
  h.state.rpc = {};
  h.state.linkExisting = null;
  h.state.linkCreated = { token: "tok-new", last_regenerated_at: "t0" };
  h.state.linkCreateError = null;
  h.state.regen = { data: null, error: null };
  h.calls.rpc = [];
  h.calls.linkInsert = [];
});

describe("verifyExternalReview", () => {
  it("returns invalid for an empty token without calling the RPC", async () => {
    const res = await verifyExternalReview("");
    expect(res).toEqual({ success: false, error: "invalid" });
    expect(h.calls.rpc).toHaveLength(0);
  });

  it("maps an RLS denial (42501) to invalid for a spent or bad token", async () => {
    h.state.rpc.verify_external_review = {
      data: null,
      error: { code: "42501" },
    };
    const res = await verifyExternalReview(VERIFY_TOKEN);
    expect(res).toEqual({ success: false, error: "invalid" });
    expect(h.sendNewReviewEmail).not.toHaveBeenCalled();
  });

  it("returns unknown on an unexpected RPC error", async () => {
    h.state.rpc.verify_external_review = {
      data: null,
      error: { code: "XX000", message: "boom" },
    };
    const res = await verifyExternalReview(VERIFY_TOKEN);
    expect(res).toEqual({ success: false, error: "unknown" });
  });

  it("verifies a valid token and notifies the nurse", async () => {
    h.state.rpc.verify_external_review = {
      data: {
        review_id: "rev-1",
        nurse_user_id: NURSE_ID,
        reviewer_name: "Sam",
        rating: 4,
      },
      error: null,
    };
    const res = await verifyExternalReview(VERIFY_TOKEN);
    expect(res).toEqual({ success: true, reviewerName: "Sam", rating: 4 });
    expect(h.calls.rpc).toEqual([
      { name: "verify_external_review", params: { p_token: VERIFY_TOKEN } },
    ]);
    expect(h.sendNewReviewEmail).toHaveBeenCalledTimes(1);
  });
});

describe("submitExternalReview", () => {
  it("maps an RLS denial (42501) to link_invalid", async () => {
    h.state.rpc.submit_external_review = {
      data: null,
      error: { code: "42501" },
    };
    const res = await submitExternalReview(VALID_EXTERNAL);
    expect(res).toEqual({ success: false, error: "link_invalid" });
    expect(h.sendVerifyReviewEmail).not.toHaveBeenCalled();
  });

  it("returns invalid with field errors for a malformed submission", async () => {
    const res = await submitExternalReview({ ...VALID_EXTERNAL, rating: 9 });
    expect(res.success).toBe(false);
    expect(res.error).toBe("invalid");
    expect(h.calls.rpc).toHaveLength(0);
  });

  it("submits via the RPC and queues the verification email on success", async () => {
    h.state.rpc.submit_external_review = {
      data: { review_id: "rev-1", verification_token: "vtok" },
      error: null,
    };
    const res = await submitExternalReview(VALID_EXTERNAL);
    expect(res).toEqual({ success: true, reviewId: "rev-1" });
    expect(h.sendVerifyReviewEmail).toHaveBeenCalledTimes(1);
    expect(h.sendVerifyReviewEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sam@example.com",
        verificationToken: "vtok",
      }),
    );
  });
});

describe("getOrCreateReviewLink", () => {
  it("returns the existing link without inserting", async () => {
    h.state.linkExisting = { token: "tok-existing", last_regenerated_at: "t1" };
    const res = await getOrCreateReviewLink();
    expect(res.link).toEqual({
      token: "tok-existing",
      last_regenerated_at: "t1",
    });
    expect(h.calls.linkInsert).toHaveLength(0);
  });

  it("creates a link on first read when none exists", async () => {
    h.state.linkExisting = null;
    const res = await getOrCreateReviewLink();
    expect(res.link).toEqual({ token: "tok-new", last_regenerated_at: "t0" });
    expect(h.calls.linkInsert).toHaveLength(1);
  });

  it("returns an error when link creation fails", async () => {
    h.state.linkExisting = null;
    h.state.linkCreateError = { message: "insert boom" };
    const res = await getOrCreateReviewLink();
    expect(res.link).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});

describe("regenerateReviewLink", () => {
  it("rotates the token and returns the new link", async () => {
    h.state.regen = {
      data: { token: "tok-rotated", last_regenerated_at: "t2" },
      error: null,
    };
    const res = await regenerateReviewLink();
    expect(res.link).toEqual({
      token: "tok-rotated",
      last_regenerated_at: "t2",
    });
  });

  it("falls back to creating a link when there is nothing to rotate", async () => {
    h.state.regen = { data: null, error: null };
    h.state.linkExisting = null;
    const res = await regenerateReviewLink();
    // Fell through to getOrCreateReviewLink, which created a fresh link.
    expect(res.link).toEqual({ token: "tok-new", last_regenerated_at: "t0" });
    expect(h.calls.linkInsert).toHaveLength(1);
  });

  it("returns an error when the rotate write fails", async () => {
    h.state.regen = { data: null, error: { message: "update boom" } };
    const res = await regenerateReviewLink();
    expect(res.link).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});
