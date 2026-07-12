// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// #652. The three admin actions were check-then-act: SELECT the row, compare the
// status in JavaScript, then UPDATE by id alone. Two admins clicking at once (or
// one action retried after it appeared to hang) both pass the check, both write,
// and both go on to fire the side effect. On verification that side effect is an
// email to a real nurse telling her she has been approved, plus a second row in
// the admin audit log. `guardedStatusUpdate` exists precisely for this shape
// (#419, #562) and none of these three used it.
//
// The tests that matter here are the LOSER's tests: the caller whose UPDATE
// matched no row must come away having sent nothing.

const h = vi.hoisted(() => {
  const state = {
    // Rows the pre-flight SELECT still returns (kept: it is what produces
    // not_found and gives us the email address). The race is decided by whether
    // the guarded UPDATE matches, which is what `updateMatches` controls.
    profile: {
      user_id: "nurse-1",
      slug: "jane-rn",
      verification_status: "pending",
      users: { first_name: "Jane", email: "jane@example.com" },
    } as Record<string, unknown> | null,
    review: {
      id: "rev-1",
      status: "pending",
      nurse_user_id: "nurse-1",
    } as Record<string, unknown> | null,
    target: {
      id: "user-9",
      email: "user9@example.com",
      first_name: "Sam",
      role: "family",
      is_suspended: false,
      is_deleted: false,
    } as Record<string, unknown> | null,
    /** false = a concurrent caller already applied the transition. */
    updateMatches: true,
  };

  const calls = {
    adminActions: [] as unknown[],
    approvedEmail: [] as unknown[],
    suspendedEmail: [] as unknown[],
    authBan: [] as unknown[],
  };

  return { state, calls };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
// These tests are about what happens AFTER an admin is admitted: whether a
// second, concurrent apply can fire the side effect twice. The refusal direction
// (a family or nurse caller being turned away, with no write and no email) is
// covered against the REAL guard in src/lib/admin/authz-boundary.test.ts, and the
// mutation run in #642 proves those cases fail when the guard is deleted.
vi.mock("@/lib/auth/helpers", () => ({
  // eslint-disable-next-line local/no-mocked-auth-guard -- negative direction covered by src/lib/admin/authz-boundary.test.ts
  requireAdmin: async () => ({ id: "admin-1", role: "admin" }),
}));
vi.mock("@/lib/email/send", () => ({
  sendVerificationApprovedEmail: (...a: unknown[]) => {
    h.calls.approvedEmail.push(a);
    return Promise.resolve();
  },
  sendVerificationRejectedEmail: () => Promise.resolve(),
  sendAccountSuspendedEmail: (...a: unknown[]) => {
    h.calls.suspendedEmail.push(a);
    return Promise.resolve();
  },
  sendAccountRemovedEmail: () => Promise.resolve(),
  sendDisputeDecisionEmail: () => Promise.resolve(),
}));

/**
 * A read chain ends in .maybeSingle(); the guarded UPDATE chain ends in
 * .select(). So the builder just remembers whether .update() was called, and the
 * terminal .select() on an update chain hands back the rows Postgres would:
 * one when this caller won the race, zero when a concurrent caller got there
 * first (`updateMatches: false`).
 */
function builder(table: string) {
  let updating = false;
  const b: Record<string, unknown> = {};

  const rowFor = () =>
    table === "nurse_profiles"
      ? h.state.profile
      : table === "reviews"
        ? h.state.review
        : h.state.target;

  b.select = () =>
    updating
      ? Promise.resolve(
          h.state.updateMatches
            ? { data: [{ id: "x" }], error: null }
            : { data: [], error: null },
        )
      : b;
  b.eq = () => b;
  b.in = () => b;
  b.maybeSingle = async () => ({ data: rowFor(), error: null });
  b.update = () => {
    updating = true;
    return b;
  };
  b.insert = async (payload: unknown) => {
    if (table === "admin_actions") h.calls.adminActions.push(payload);
    return { error: null };
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (t: string) => builder(t),
    auth: {
      admin: {
        updateUserById: (...a: unknown[]) => {
          h.calls.authBan.push(a);
          return Promise.resolve({ error: null });
        },
      },
    },
  }),
}));

const UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.updateMatches = true;
  h.calls.adminActions.length = 0;
  h.calls.approvedEmail.length = 0;
  h.calls.suspendedEmail.length = 0;
  h.calls.authBan.length = 0;
});

describe("approveVerification cannot be applied twice", () => {
  it("emails the nurse and writes one audit row when it wins the race", async () => {
    const { approveVerification } = await import("./verification-actions");

    const res = await approveVerification({ user_id: UUID });

    expect(res.success).toBe(true);
    expect(h.calls.approvedEmail).toHaveLength(1);
    expect(h.calls.adminActions).toHaveLength(1);
  });

  it("sends NO second email when a concurrent admin already approved her", async () => {
    // The loser. Under the old check-then-act both callers read `pending`, both
    // wrote, and Jane got told twice that she had been approved.
    h.state.updateMatches = false;
    const { approveVerification } = await import("./verification-actions");

    const res = await approveVerification({ user_id: UUID });

    expect(res).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.approvedEmail).toHaveLength(0);
    expect(h.calls.adminActions).toHaveLength(0);
  });
});

describe("adminApproveReview cannot be applied twice", () => {
  it("writes no audit row when a concurrent admin already resolved it", async () => {
    h.state.updateMatches = false;
    const { adminApproveReview } = await import("./review-actions");

    const res = await adminApproveReview({ review_id: UUID });

    expect(res).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.adminActions).toHaveLength(0);
  });
});

describe("suspendAccount cannot be applied twice", () => {
  it("does not re-suspend or re-email when a concurrent admin already did", async () => {
    h.state.updateMatches = false;
    const { suspendAccount } = await import("./account-actions");

    const res = await suspendAccount({ user_id: UUID });

    expect(res).toEqual({ success: false, error: "wrong_state" });
    expect(h.calls.suspendedEmail).toHaveLength(0);
    expect(h.calls.authBan).toHaveLength(0);
    expect(h.calls.adminActions).toHaveLength(0);
  });
});
