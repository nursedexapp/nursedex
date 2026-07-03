// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const cancelActiveStripeSubscriptions = vi.fn(async () => {});
  const state = {
    target: {
      id: "target-1",
      email: "target@example.com",
      first_name: "Target",
      is_deleted: false,
    } as Record<string, unknown> | null,
    updateError: null as { message: string } | null,
  };
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    let updating = false;
    b.select = () => b;
    b.eq = () =>
      table === "users" && updating
        ? Promise.resolve({ error: state.updateError })
        : b;
    b.maybeSingle = () => Promise.resolve({ data: state.target, error: null });
    b.update = () => {
      updating = true;
      return b;
    };
    b.upsert = () => Promise.resolve({ error: null });
    b.insert = () => Promise.resolve({ error: null });
    return b;
  }
  return {
    cancelActiveStripeSubscriptions,
    state,
    client: () => ({
      from: builder,
      auth: {
        admin: {
          updateUserById: () => Promise.resolve({ error: null }),
        },
      },
    }),
  };
});

vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
  sendAccountSuspendedEmail: vi.fn(async () => {}),
  sendAccountRemovedEmail: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/helpers", () => ({
  requireAdmin: async () => ({ id: "admin-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.client() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/stripe/cancel-subscriptions", () => ({
  cancelActiveStripeSubscriptions: h.cancelActiveStripeSubscriptions,
}));

import { removeAccount } from "./account-actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.target = {
    id: "target-1",
    email: "target@example.com",
    first_name: "Target",
    is_deleted: false,
  };
  h.state.updateError = null;
});

describe("removeAccount", () => {
  it("cancels the target's active Stripe subscriptions via the shared helper", async () => {
    const res = await removeAccount({
      user_id: "11111111-1111-4111-8111-111111111111",
      reason: "policy violation",
    });

    expect(res.success).toBe(true);
    expect(h.cancelActiveStripeSubscriptions).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("returns not_found when the target does not exist", async () => {
    h.state.target = null;
    const res = await removeAccount({
      user_id: "11111111-1111-4111-8111-111111111111",
      reason: "policy violation",
    });

    expect(res).toEqual({ success: false, error: "not_found" });
    expect(h.cancelActiveStripeSubscriptions).not.toHaveBeenCalled();
  });
});
