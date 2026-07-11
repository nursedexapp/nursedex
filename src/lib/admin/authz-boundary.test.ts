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

// Every module that exports an admin server action. The completeness test at the
// bottom walks these, so a new admin module must be added here too.
const MODULES = {
  "./account-actions": () => import("./account-actions"),
  "./role-actions": () => import("./role-actions"),
  "./review-actions": () => import("./review-actions"),
  "./verification-actions": () => import("./verification-actions"),
} as const;

type ModuleName = keyof typeof MODULES;

// One boundary case per admin action: the caller who must be refused, and a
// VALID input for that action.
//
// The input has to be valid. Every action safeParses its argument BEFORE calling
// requireAdmin, so a malformed one returns { error: "invalid" } and never reaches
// the guard: the test would then pass against an action with no guard at all.
const CASES: ReadonlyArray<{
  module: ModuleName;
  action: string;
  caller: string;
  input: unknown;
}> = [
  {
    module: "./account-actions",
    action: "suspendAccount",
    caller: "family",
    input: { user_id: UUID },
  },
  {
    module: "./account-actions",
    action: "unsuspendAccount",
    caller: "family",
    input: { user_id: UUID },
  },
  {
    module: "./account-actions",
    action: "removeAccount",
    caller: "family",
    input: { user_id: UUID, reason: "spam" },
  },
  {
    module: "./review-actions",
    action: "adminApproveReview",
    caller: "nurse",
    input: { review_id: UUID },
  },
  {
    module: "./review-actions",
    action: "adminRejectReview",
    caller: "nurse",
    input: { review_id: UUID },
  },
  {
    module: "./review-actions",
    action: "adminResolveRemovalRequest",
    caller: "family",
    input: { review_id: UUID, decision: "honor" },
  },
  {
    module: "./review-actions",
    action: "adminResolveDispute",
    caller: "family",
    input: { review_id: UUID, decision: "remove" },
  },
  {
    module: "./verification-actions",
    action: "approveVerification",
    caller: "family",
    input: { user_id: UUID },
  },
  {
    module: "./verification-actions",
    action: "rejectVerification",
    caller: "nurse",
    input: { user_id: UUID, reason: "Credential expired" },
  },
  // Super-admin only: a plain admin is a stricter bar than a family or nurse,
  // and is the caller most likely to slip through a weakened guard.
  {
    module: "./role-actions",
    action: "promoteToAdmin",
    caller: "admin",
    input: { email: "victim@example.com", role: "admin" },
  },
  {
    module: "./role-actions",
    action: "demoteAdmin",
    caller: "admin",
    input: { user_id: UUID },
  },
];

describe("admin actions reject an unauthorized caller with no side effect", () => {
  it.each(CASES)(
    "$action refuses a $caller caller and writes nothing",
    async ({ module, action, caller, input }) => {
      setCaller(caller);
      const mod = (await MODULES[module]()) as unknown as Record<
        string,
        (i: unknown) => Promise<unknown>
      >;

      await expect(mod[action](input)).rejects.toThrow(/NEXT_REDIRECT/);

      expectNoWrites();
    },
  );
});

// A sampled boundary suite silently stops covering the thing it was written for:
// the six actions added after #493 inherited no case, and nothing said so. This
// fails when an exported action has no entry in CASES, so a new admin action
// cannot ship without a boundary test (#633).
describe("every exported admin action has a boundary case", () => {
  it.each(Object.keys(MODULES) as ModuleName[])("%s", async (name) => {
    const mod = await MODULES[name]();
    const exported = Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    const covered = CASES.filter((c) => c.module === name)
      .map((c) => c.action)
      .sort();

    expect(exported).toEqual(covered);
  });
});
