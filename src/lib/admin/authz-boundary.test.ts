// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #493 (AUD-139). The e2e smoke suite renders admin routes as a
// super_admin but never asserts that a non-admin is refused. Admin server
// actions rely on requireAdmin / requireSuperAdmin; nothing verified the
// negative direction, so a dropped guard would let a normal user moderate
// accounts, approve verifications, or grant admin, and no test would notice.
//
// These are permanent security-boundary regression guards. They run the REAL
// requireAdmin / requireSuperAdmin (not a mock of them) against a mocked
// session, so removing the `await requireAdmin()` line from an action makes the
// matching test fail. The one seam we mock is the Supabase client the guard
// reads the caller's role through, plus next/navigation's redirect, which the
// real guards call and which really throws NEXT_REDIRECT in the app.

const h = vi.hoisted(() => {
  const state = {
    // The row getCurrentUser reads for the current caller. null = signed out.
    user: null as Record<string, unknown> | null,
  };
  // Spies on every mutating path. A rejected caller must touch none of them.
  const writes = {
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    updateUserById: vi.fn(),
    deleteUser: vi.fn(),
  };
  function builder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.single = () => Promise.resolve({ data: state.user, error: null });
    b.maybeSingle = () => Promise.resolve({ data: state.user, error: null });
    b.update = (...a: unknown[]) => {
      writes.update(...a);
      return b;
    };
    b.insert = (...a: unknown[]) => {
      writes.insert(...a);
      return Promise.resolve({ error: null });
    };
    b.delete = (...a: unknown[]) => {
      writes.delete(...a);
      return b;
    };
    b.upsert = (...a: unknown[]) => {
      writes.upsert(...a);
      return Promise.resolve({ error: null });
    };
    return b;
  }
  const client = () => ({
    from: () => builder(),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: state.user ? { id: state.user.id } : null },
        }),
      admin: {
        updateUserById: (...a: unknown[]) => {
          writes.updateUserById(...a);
          return Promise.resolve({ error: null });
        },
        deleteUser: (...a: unknown[]) => {
          writes.deleteUser(...a);
          return Promise.resolve({ error: null });
        },
      },
    },
  });
  return { state, writes, client };
});

vi.mock("next/navigation", () => ({
  // Mirror the real redirect, which throws NEXT_REDIRECT to halt the action.
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));

function setCaller(role: string | null) {
  h.state.user =
    role === null
      ? null
      : { id: `caller-${role}`, role, is_suspended: false, is_deleted: false };
}

function expectNoWrites() {
  expect(h.writes.update).not.toHaveBeenCalled();
  expect(h.writes.insert).not.toHaveBeenCalled();
  expect(h.writes.delete).not.toHaveBeenCalled();
  expect(h.writes.upsert).not.toHaveBeenCalled();
  expect(h.writes.updateUserById).not.toHaveBeenCalled();
  expect(h.writes.deleteUser).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Fresh module graph per test so React cache() in getCurrentUser cannot
  // carry a caller's role from one test into the next.
  vi.resetModules();
});

// Real v4 UUIDs: z.string().uuid() in Zod 4 rejects placeholder shapes.
const UUID = "11111111-1111-4111-8111-111111111111";

describe("requireAdmin rejects non-admins and admits admins", () => {
  it.each(["family", "nurse"])("redirects a %s caller", async (role) => {
    setCaller(role);
    const { requireAdmin } = await import("@/lib/auth/helpers");
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("redirects a signed-out caller to /login", async () => {
    setCaller(null);
    const { requireAdmin } = await import("@/lib/auth/helpers");
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it.each(["admin", "super_admin"])("admits a %s caller", async (role) => {
    setCaller(role);
    const { requireAdmin } = await import("@/lib/auth/helpers");
    const user = await requireAdmin();
    expect(user.role).toBe(role);
  });
});

describe("requireSuperAdmin rejects plain admins", () => {
  it("redirects an admin to /admin", async () => {
    setCaller("admin");
    const { requireSuperAdmin } = await import("@/lib/auth/helpers");
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("admits a super_admin", async () => {
    setCaller("super_admin");
    const { requireSuperAdmin } = await import("@/lib/auth/helpers");
    const user = await requireSuperAdmin();
    expect(user.role).toBe("super_admin");
  });
});

describe("admin actions reject a non-admin caller with no side effect", () => {
  it("suspendAccount", async () => {
    setCaller("family");
    const { suspendAccount } = await import("./account-actions");
    await expect(suspendAccount({ user_id: UUID })).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expectNoWrites();
  });

  it("removeAccount", async () => {
    setCaller("family");
    const { removeAccount } = await import("./account-actions");
    await expect(
      removeAccount({ user_id: UUID, reason: "spam" }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expectNoWrites();
  });

  it("adminApproveReview", async () => {
    setCaller("nurse");
    const { adminApproveReview } = await import("./review-actions");
    await expect(adminApproveReview({ review_id: UUID })).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expectNoWrites();
  });

  it("approveVerification", async () => {
    setCaller("family");
    const { approveVerification } = await import("./verification-actions");
    await expect(approveVerification({ user_id: UUID })).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expectNoWrites();
  });

  it("promoteToAdmin rejects even a plain admin (super_admin only)", async () => {
    setCaller("admin");
    const { promoteToAdmin } = await import("./role-actions");
    await expect(
      promoteToAdmin({ email: "victim@example.com", role: "admin" }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expectNoWrites();
  });
});
