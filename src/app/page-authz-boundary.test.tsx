// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The page half of the authorization boundary.
//
// src/lib/admin/authz-boundary.test.ts covers server ACTIONS. Pages were the
// remaining hole: /dashboard and the admin screens are gated by their own
// requireAuth / requireRole / requireAdmin call and nothing else. The proxy only
// gates the brand password, not per-user auth, so that one line in the page is
// the whole gate. Both dashboard page tests mocked it away, so nothing anywhere
// proved a signed-out visitor is bounced.
//
// As in the action suite, the REAL guard runs here: the only seam mocked is the
// Supabase client the session is read through (#634).

const h = vi.hoisted(() => ({
  state: { user: null as Record<string, unknown> | null },
}));

const client = () => ({
  from: () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.range = () => b;
    b.gte = () => b;
    b.lte = () => b;
    b.single = () => Promise.resolve({ data: h.state.user, error: null });
    b.maybeSingle = () => Promise.resolve({ data: h.state.user, error: null });
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null, count: 0 });
    return b;
  },
  auth: {
    getUser: () =>
      Promise.resolve({
        data: { user: h.state.user ? { id: h.state.user.id } : null },
      }),
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  // The real redirect throws NEXT_REDIRECT to halt rendering.
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => client(),
}));

// The three heaviest leaf components: charts (recharts) and the profile forms
// (which pull in the image-crop modal). Importing them for real costs minutes
// across this suite, and the guard throws long before a page renders anything.
// Stubbing them keeps the REAL guard under test while the import graph stays
// light. They have their own component tests.
vi.mock("@/components/analytics/StatsChart", () => ({
  StatsChart: () => null,
  default: () => null,
}));
vi.mock("./(dashboard)/dashboard/edit/ProfileEditForm", () => ({
  default: () => null,
  ProfileEditForm: () => null,
}));
vi.mock("./(dashboard)/dashboard/onboarding/OnboardingWizard", () => ({
  default: () => null,
  OnboardingWizard: () => null,
}));

function setCaller(role: string | null) {
  h.state.user =
    role === null
      ? null
      : { id: `caller-${role}`, role, is_suspended: false, is_deleted: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  // getCurrentUser is wrapped in React cache(); a fresh module graph stops one
  // test's caller leaking into the next.
  vi.resetModules();
});

// Every guarded page and layout, and the caller who must be turned away.
// A layout guards everything nested under it, so (admin)/layout.tsx is the gate
// for the whole admin section.
const PAGES = {
  "(admin)/layout": {
    load: () => import("./(admin)/layout"),
    refuse: "family",
  },
  "(admin)/admin/admins/page": {
    load: () => import("./(admin)/admin/admins/page"),
    // super-admin only: a plain admin is the stricter bar, and the caller most
    // likely to slip through a weakened guard.
    refuse: "admin",
  },
  "(admin)/admin/analytics/page": {
    load: () => import("./(admin)/admin/analytics/page"),
    refuse: "admin",
  },
  "(auth)/role-select/layout": {
    load: () => import("./(auth)/role-select/layout"),
    refuse: null,
  },
  "(dashboard)/dashboard/page": {
    load: () => import("./(dashboard)/dashboard/page"),
    refuse: null,
  },
  "(dashboard)/dashboard/settings/page": {
    load: () => import("./(dashboard)/dashboard/settings/page"),
    refuse: null,
  },
  "(dashboard)/dashboard/analytics/page": {
    load: () => import("./(dashboard)/dashboard/analytics/page"),
    refuse: "family",
  },
  "(dashboard)/dashboard/edit/page": {
    load: () => import("./(dashboard)/dashboard/edit/page"),
    refuse: "family",
  },
  "(dashboard)/dashboard/onboarding/page": {
    load: () => import("./(dashboard)/dashboard/onboarding/page"),
    refuse: "family",
  },
  "(dashboard)/dashboard/preview/page": {
    load: () => import("./(dashboard)/dashboard/preview/page"),
    refuse: "family",
  },
  "(dashboard)/dashboard/reviews/page": {
    load: () => import("./(dashboard)/dashboard/reviews/page"),
    refuse: "family",
  },
  "(dashboard)/dashboard/revealed/page": {
    load: () => import("./(dashboard)/dashboard/revealed/page"),
    refuse: "nurse",
  },
  "(dashboard)/dashboard/saved/page": {
    load: () => import("./(dashboard)/dashboard/saved/page"),
    refuse: "nurse",
  },
  "(public)/onboarding/family/page": {
    load: () => import("./(public)/onboarding/family/page"),
    refuse: "nurse",
  },
  "(public)/blog/preview/[id]/page": {
    load: () => import("./(public)/blog/preview/[id]/page"),
    refuse: "family",
  },
} as const;

type PageName = keyof typeof PAGES;

/** Props a page or layout may destructure. The guard throws before they matter. */
const PROPS = {
  params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
  searchParams: Promise.resolve({}),
  children: null,
};

describe("a guarded page turns away the wrong caller", () => {
  it.each(Object.keys(PAGES) as PageName[])("%s", async (name) => {
    const { refuse, load } = PAGES[name];
    setCaller(refuse);

    const mod = (await load()) as {
      default: (props: unknown) => Promise<unknown>;
    };

    await expect(mod.default(PROPS)).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

// The same completeness guard the action suite has: a new guarded page must be
// listed above, or this fails naming it. Sampling is how the action suite went
// stale, and pages would go the same way.
describe("every guarded page is covered", () => {
  it("finds no unlisted guarded page or layout under src/app", () => {
    const appRoot = dirname(fileURLToPath(import.meta.url));

    const guarded: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name === "page.tsx" ||
          entry.name === "layout.tsx"
        ) {
          const src = readFileSync(full, "utf8");
          if (
            /require(Auth|Role|Admin|SuperAdmin)\s*\(/.test(src) &&
            // The guards live in @/lib/auth/helpers; a page merely importing the
            // type would not match, but be explicit about the call.
            /await require(Auth|Role|Admin|SuperAdmin)\s*\(/.test(src)
          ) {
            guarded.push(
              relative(appRoot, full).replace(/\.tsx$/, "").replace(/\\/g, "/"),
            );
          }
        }
      }
    };
    walk(appRoot);

    const listed = new Set(Object.keys(PAGES));
    expect(guarded.filter((p) => !listed.has(p)).sort()).toEqual([]);
  });
});
