// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  //
  // Mail counts as a side effect, not just database writes: these actions tell a
  // nurse her verification was rejected, or an account it was suspended. The
  // suite mocks next/server's after() to run inline, so a dropped guard really
  // would reach these.
  const writes = {
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    updateUserById: vi.fn(),
    deleteUser: vi.fn(),
    sendAccountSuspendedEmail: vi.fn(),
    sendAccountRemovedEmail: vi.fn(),
    sendVerificationApprovedEmail: vi.fn(),
    sendVerificationRejectedEmail: vi.fn(),
    sendDisputeDecisionEmail: vi.fn(),
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
vi.mock("@/lib/email/send", () => ({
  sendAccountSuspendedEmail: h.writes.sendAccountSuspendedEmail,
  sendAccountRemovedEmail: h.writes.sendAccountRemovedEmail,
  sendVerificationApprovedEmail: h.writes.sendVerificationApprovedEmail,
  sendVerificationRejectedEmail: h.writes.sendVerificationRejectedEmail,
  sendDisputeDecisionEmail: h.writes.sendDisputeDecisionEmail,
}));

function setCaller(role: string | null) {
  h.state.user =
    role === null
      ? null
      : { id: `caller-${role}`, role, is_suspended: false, is_deleted: false };
}

// Walks the spies rather than listing them, so a side effect added to `writes`
// is asserted on automatically instead of waiting to be added here too.
function expectNoSideEffects() {
  for (const [name, spy] of Object.entries(h.writes)) {
    expect(spy, `${name} ran for an unauthorized caller`).not.toHaveBeenCalled();
  }
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

// Every module that exports an admin-guarded server action.
//
// Admin power is NOT confined to src/lib/admin: publishing and deleting blog
// posts, moderating comments, and mailing the whole newsletter list all call
// requireAdmin from their own feature folders, and none of them had a boundary
// test. The first version of this suite only looked at src/lib/admin, which is
// the same sampling mistake it exists to prevent, one directory up.
const MODULES = {
  "./account-actions": () => import("./account-actions"),
  "./role-actions": () => import("./role-actions"),
  "./review-actions": () => import("./review-actions"),
  "./verification-actions": () => import("./verification-actions"),
  "@/lib/blog/actions": () => import("@/lib/blog/actions"),
  "@/lib/blog/taxonomy-actions": () => import("@/lib/blog/taxonomy-actions"),
  "@/lib/comments/actions": () => import("@/lib/comments/actions"),
  "@/lib/newsletter/actions": () => import("@/lib/newsletter/actions"),
  // Role-guarded rather than admin-guarded: requireRole is what keeps a family
  // out of a nurse's profile, photos and review replies, and a nurse out of a
  // family's hire records. Every test for these mocked requireRole away, so the
  // wrong-role direction was verified nowhere.
  "@/lib/profile/actions": () => import("@/lib/profile/actions"),
  "@/lib/hires/actions": () => import("@/lib/hires/actions"),
  "@/lib/reviews/nurse-actions": () => import("@/lib/reviews/nurse-actions"),
  "@/lib/reviews/external-actions": () =>
    import("@/lib/reviews/external-actions"),
} as const;

type ModuleName = keyof typeof MODULES;

// Exports in those modules that are deliberately NOT admin-guarded: anyone may
// submit a comment or manage their own newsletter subscription. Listing them
// explicitly is what lets the completeness test demand that every OTHER export
// carries a boundary case, in modules that mix public and privileged actions.
const PUBLIC_EXPORTS: Record<string, readonly string[]> = {
  "@/lib/comments/actions": ["submitComment"],
  "@/lib/newsletter/actions": [
    "subscribeNewsletter",
    "confirmNewsletter",
    "unsubscribeByEmail",
    "unsubscribeNewsletter",
  ],
  // An external reviewer is a stranger holding a link, by design: they are not
  // signed in at all, so these two cannot be role-guarded.
  "@/lib/reviews/external-actions": [
    "submitExternalReview",
    "verifyExternalReview",
  ],
};

// One boundary case per admin-guarded action: the caller who must be refused,
// and the arguments to call it with.
//
// For the src/lib/admin actions the arguments must be VALID, because those parse
// their input BEFORE calling requireAdmin: a malformed one returns
// { error: "invalid" } and never reaches the guard, so the test would pass
// against an action with no guard at all. The blog, comment and newsletter
// actions guard first and parse second, so their arguments only need to exist.
const CASES: ReadonlyArray<{
  module: ModuleName;
  action: string;
  /** The caller who must be refused. null = signed out entirely. */
  caller: string | null;
  args: unknown[];
}> = [
  {
    module: "./account-actions",
    action: "suspendAccount",
    caller: "family",
    args: [{ user_id: UUID }],
  },
  {
    module: "./account-actions",
    action: "unsuspendAccount",
    caller: "family",
    args: [{ user_id: UUID }],
  },
  {
    module: "./account-actions",
    action: "removeAccount",
    caller: "family",
    args: [{ user_id: UUID, reason: "spam" }],
  },
  {
    module: "./review-actions",
    action: "adminApproveReview",
    caller: "nurse",
    args: [{ review_id: UUID }],
  },
  {
    module: "./review-actions",
    action: "adminRejectReview",
    caller: "nurse",
    args: [{ review_id: UUID }],
  },
  {
    module: "./review-actions",
    action: "adminResolveRemovalRequest",
    caller: "family",
    args: [{ review_id: UUID, decision: "honor" }],
  },
  {
    module: "./review-actions",
    action: "adminResolveDispute",
    caller: "family",
    args: [{ review_id: UUID, decision: "remove" }],
  },
  {
    module: "./verification-actions",
    action: "approveVerification",
    caller: "family",
    args: [{ user_id: UUID }],
  },
  {
    module: "./verification-actions",
    action: "rejectVerification",
    caller: "nurse",
    args: [{ user_id: UUID, reason: "Credential expired" }],
  },
  // Super-admin only: a plain admin is a stricter bar than a family or nurse,
  // and is the caller most likely to slip through a weakened guard.
  {
    module: "./role-actions",
    action: "promoteToAdmin",
    caller: "admin",
    args: [{ email: "victim@example.com", role: "admin" }],
  },
  {
    module: "./role-actions",
    action: "demoteAdmin",
    caller: "admin",
    args: [{ user_id: UUID }],
  },

  // Blog. A dropped guard here lets any signed-in user publish, unpublish, or
  // permanently delete posts on the public site.
  {
    module: "@/lib/blog/actions",
    action: "savePost",
    caller: "family",
    args: [{ title: "t", slug: "s", body_html: "<p>x</p>" }],
  },
  {
    module: "@/lib/blog/actions",
    action: "autosavePost",
    caller: "family",
    args: [{ id: UUID, body_html: "<p>x</p>" }],
  },
  {
    module: "@/lib/blog/actions",
    action: "restoreRevision",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "unpublishPost",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "publishNow",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "archivePost",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "togglePinned",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "deletePost",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/actions",
    action: "createCategory",
    caller: "family",
    args: ["Nursing"],
  },

  // Blog taxonomy. Renaming or merging a category rewrites public URLs.
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "renameCategory",
    caller: "family",
    args: [UUID, "Renamed"],
  },
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "renameTag",
    caller: "family",
    args: [UUID, "Renamed"],
  },
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "deleteCategory",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "deleteTag",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "mergeCategory",
    caller: "family",
    args: [UUID, UUID],
  },
  {
    module: "@/lib/blog/taxonomy-actions",
    action: "mergeTag",
    caller: "family",
    args: [UUID, UUID],
  },

  // Comment moderation. Anyone may submit a comment; only an admin decides what
  // goes live, and approving one emails the commenter.
  {
    module: "@/lib/comments/actions",
    action: "approveComment",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/comments/actions",
    action: "rejectComment",
    caller: "family",
    args: [UUID],
  },
  {
    module: "@/lib/comments/actions",
    action: "deleteComment",
    caller: "family",
    args: [UUID],
  },

  // The loudest one in the codebase: this mails every confirmed subscriber.
  {
    module: "@/lib/newsletter/actions",
    action: "sendNewsletterIssue",
    caller: "family",
    args: [{ subject: "Hi", body_html: "<p>x</p>" }],
  },

  // Nurse profile. A family must not read or write a nurse's profile, onboarding
  // state, availability, or photos. requireRole is the only thing stopping it.
  {
    module: "@/lib/profile/actions",
    action: "getNurseProfile",
    caller: "family",
    args: [],
  },
  {
    module: "@/lib/profile/actions",
    action: "saveOnboardingStep",
    caller: "family",
    args: [{ step: 1 }],
  },
  {
    module: "@/lib/profile/actions",
    action: "completeOnboarding",
    caller: "family",
    args: [],
  },
  {
    module: "@/lib/profile/actions",
    action: "updateNurseProfile",
    caller: "family",
    args: [{ headline: "hi" }],
  },
  {
    module: "@/lib/profile/actions",
    action: "toggleAvailability",
    caller: "family",
    args: [true],
  },
  {
    module: "@/lib/profile/actions",
    action: "requestPhotoUploadUrl",
    caller: "family",
    args: ["photo.png"],
  },
  {
    module: "@/lib/profile/actions",
    action: "confirmPhotoUpload",
    caller: "family",
    args: ["photos/x.png"],
  },
  {
    module: "@/lib/profile/actions",
    action: "deletePhoto",
    caller: "family",
    args: ["photos/x.png"],
  },
  // The one requireAuth action rather than requireRole: it deletes the caller's
  // OWN account, so the bar is "signed in at all". A signed-out caller bounces.
  {
    module: "@/lib/profile/actions",
    action: "softDeleteAccount",
    caller: null,
    args: [],
  },

  // Hires. Recording and confirming a hire is the family's side, claiming one is
  // the nurse's. Each must refuse the other role.
  {
    module: "@/lib/hires/actions",
    action: "recordFamilyHire",
    caller: "nurse",
    args: [{ nurse_user_id: UUID }],
  },
  {
    module: "@/lib/hires/actions",
    action: "claimHireByEmail",
    caller: "family",
    args: [{ family_email: "fam@example.com" }],
  },
  {
    module: "@/lib/hires/actions",
    action: "confirmHireFromToken",
    caller: "nurse",
    args: [{ token: UUID }],
  },
  {
    module: "@/lib/hires/actions",
    action: "rejectHireFromToken",
    caller: "nurse",
    args: [{ token: UUID }],
  },

  // A nurse's replies to her own reviews. A family must not answer or dispute
  // reviews on someone else's profile.
  {
    module: "@/lib/reviews/nurse-actions",
    action: "saveNurseResponse",
    caller: "family",
    args: [{ review_id: UUID, text: "thanks" }],
  },
  {
    module: "@/lib/reviews/nurse-actions",
    action: "disputeReview",
    caller: "family",
    args: [{ review_id: UUID, reason: "Factually inaccurate", text: "no" }],
  },
  {
    module: "@/lib/reviews/nurse-actions",
    action: "deleteNurseResponse",
    caller: "family",
    args: [UUID],
  },

  // The nurse's own shareable review link.
  {
    module: "@/lib/reviews/external-actions",
    action: "getOrCreateReviewLink",
    caller: "family",
    args: [],
  },
  {
    module: "@/lib/reviews/external-actions",
    action: "regenerateReviewLink",
    caller: "family",
    args: [],
  },
];

describe("admin actions reject an unauthorized caller with no side effect", () => {
  it.each(CASES)(
    "$action refuses a $caller caller and writes nothing",
    async ({ module, action, caller, args }) => {
      setCaller(caller);
      const mod = (await MODULES[module]()) as unknown as Record<
        string,
        (...a: unknown[]) => Promise<unknown>
      >;

      await expect(mod[action](...args)).rejects.toThrow(/NEXT_REDIRECT/);

      expectNoSideEffects();
    },
  );
});

// A sampled boundary suite silently stops covering the thing it was written for:
// the six actions added after #493 inherited no case, and nothing said so. These
// two tests close both ways that can happen (#633).

// 1. A new action added to a module we already watch. Every export must be
// either covered by a case or declared public, so adding one forces a decision
// rather than defaulting to unguarded-and-unnoticed.
describe("every exported action is covered or declared public", () => {
  it.each(Object.keys(MODULES) as ModuleName[])("%s", async (name) => {
    const mod = await MODULES[name]();
    const exported = Object.entries(mod)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    const accountedFor = [
      ...CASES.filter((c) => c.module === name).map((c) => c.action),
      ...(PUBLIC_EXPORTS[name] ?? []),
    ].sort();

    expect(exported).toEqual(accountedFor);
  });
});

// 2. A whole new admin-guarded module. Test 1 only inspects the modules listed
// in MODULES, so trusting that hand-written list reopens the same gap one level
// up. The first version of this test read src/lib/admin only, and missed the
// blog, comment and newsletter actions entirely: admin power does not live in
// one folder. Walk the whole tree instead and require every server-action file
// that imports an admin guard to be registered.
describe("every guarded module is registered", () => {
  it("finds no unwatched guard caller under src/lib", () => {
    const libRoot = dirname(dirname(fileURLToPath(import.meta.url)));

    const guarded: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts")
        ) {
          const src = readFileSync(full, "utf8");
          // Any guard, not only the admin ones. requireRole and requireAuth gate
          // a nurse's profile and a family's hires, and scanning for requireAdmin
          // alone left all four of those modules unwatched.
          if (
            src.includes('"use server"') &&
            /require(Admin|SuperAdmin|Role|Auth)\s*\(/.test(src)
          ) {
            guarded.push(full);
          }
        }
      }
    };
    walk(libRoot);

    // Both spellings the MODULES keys use: "./x" for siblings in src/lib/admin,
    // "@/lib/…" for everything else.
    const registered = new Set(
      (Object.keys(MODULES) as string[]).map((m) =>
        m.startsWith("./")
          ? join(libRoot, "admin", `${m.slice(2)}.ts`)
          : join(libRoot, `${m.replace("@/lib/", "")}.ts`),
      ),
    );

    const unwatched = guarded.filter((f) => !registered.has(f));
    expect(unwatched).toEqual([]);
  });
});
