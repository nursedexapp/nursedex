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
    // #982. Neither the ban nor the audit write was checked, so a failure to
    // write either came back to the admin as "removed". These make each one
    // fail on demand.
    targetReadError: null as { message: string } | null,
    banWriteError: null as { message: string } | null,
    auditWriteError: null as { message: string } | null,
    writes: [] as string[],
  };
  // removeAccount now claims the row through guardedStatusUpdate (#663), whose
  // chain is update().eq(id).eq(is_deleted, false).select(). So .eq() stays a
  // link and the terminal .select() on an UPDATE hands back the rows Postgres
  // would: one for the winner, zero for a caller who lost the race.
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    let updating = false;
    b.select = () =>
      updating
        ? Promise.resolve(
            state.updateError
              ? { data: null, error: state.updateError }
              : { data: [{ id: "target-1" }], error: null },
          )
        : b;
    b.eq = () => b;
    b.in = () => b;
    b.maybeSingle = () =>
      Promise.resolve(
        state.targetReadError
          ? { data: null, error: state.targetReadError }
          : { data: state.target, error: null },
      );
    b.update = () => {
      updating = true;
      state.writes.push(`update:${table}`);
      return b;
    };
    b.upsert = () => {
      state.writes.push(`upsert:${table}`);
      return Promise.resolve({
        data: null,
        error: table === "blocked_emails" ? state.banWriteError : null,
      });
    };
    b.insert = () => {
      state.writes.push(`insert:${table}`);
      return Promise.resolve({
        data: null,
        error: table === "admin_actions" ? state.auditWriteError : null,
      });
    };
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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
  sendAccountSuspendedEmail: vi.fn(async () => {}),
  sendAccountRemovedEmail: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/helpers", () => ({
  // Happy path only: this stubs the guard so the logic PAST it can be
  // exercised. The refused direction (wrong role / not signed in, and no
  // write) is covered for real in src/lib/admin/authz-boundary.test.ts,
  // which runs the actual guard.
  // eslint-disable-next-line local/no-mocked-auth-guard -- see above
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
  h.state.targetReadError = null;
  h.state.banWriteError = null;
  h.state.auditWriteError = null;
  h.state.writes = [];
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

// #982. Removing a user is meant to stop that person coming back. Neither the
// blocked_emails write nor the admin_actions write was checked, so the control
// could fail silently at both ends: the admin was told the removal succeeded
// while the ban was never written, and the evidence that it was skipped would
// have been the very row that was not written.
describe("removeAccount when a write that the removal depends on fails", () => {
  const request = {
    user_id: "11111111-1111-4111-8111-111111111111",
    reason: "policy violation",
  };

  it("refuses when the block list write fails, rather than reporting success", async () => {
    h.state.banWriteError = { message: "permission denied" };
    const res = await removeAccount(request);
    expect(res).toEqual({ success: false, error: "ban_unwritten" });
  });

  it("does nothing irreversible when the block list write fails", async () => {
    // The ban is written BEFORE the account is claimed and before Stripe, so a
    // refusal here leaves a state the admin can simply retry out of. There is
    // no admin surface for blocked_emails, so a ban that is skipped after the
    // account is gone can never be added by hand.
    h.state.banWriteError = { message: "permission denied" };
    await removeAccount(request);
    expect(h.cancelActiveStripeSubscriptions).not.toHaveBeenCalled();
    expect(h.state.writes).not.toContain("insert:admin_actions");
  });

  it("does not report the removal complete when the audit row is not written", async () => {
    h.state.auditWriteError = { message: "permission denied" };
    const res = await removeAccount(request);
    expect(res).toEqual({ success: false, error: "audit_unwritten" });
  });

  it("still finishes the cascade when the audit row fails, so billing stops", async () => {
    // By the audit write the account is already claimed as deleted. Stopping
    // there would leave a removed account with a live subscription, which is
    // worse than an unrecorded removal, so the cascade completes and the
    // result reports what is missing.
    h.state.auditWriteError = { message: "permission denied" };
    await removeAccount(request);
    expect(h.cancelActiveStripeSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("says the lookup failed rather than not_found when the read fails", async () => {
    // "could not look" and "this account does not exist" were the same answer.
    h.state.targetReadError = { message: "connection reset" };
    const res = await removeAccount(request);
    expect(res).toEqual({ success: false, error: "lookup_failed" });
    expect(h.cancelActiveStripeSubscriptions).not.toHaveBeenCalled();
  });

  it("writes the ban before it claims the row, so success means the ban exists", async () => {
    await removeAccount(request);
    expect(h.state.writes[0]).toBe("upsert:blocked_emails");
    expect(h.state.writes).toContain("update:users");
  });
});
