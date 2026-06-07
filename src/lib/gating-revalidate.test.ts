import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard for the family-onboarding infinite reload loop.
 *
 * A server action that changes state a LAYOUT uses to gate/redirect (role,
 * onboarding zip, etc.) must call `revalidatePath` BEFORE `redirect`. Without
 * it, the stale client Router Cache replays the old gate redirect and the
 * user ping-pongs forever until a hard refresh. See
 * memory feedback_revalidate_after_gating_mutation. This test fails if either
 * action drops its revalidatePath or calls it after the redirect.
 */

// Shared across the mock factories (which are hoisted above the imports).
const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

// Mock service-role so importing auth/actions doesn't pull in `server-only`,
// which isn't resolvable under vitest.
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string, type?: string) => {
    calls.push(`revalidate:${path}:${type ?? ""}`);
  }),
}));

vi.mock("next/navigation", () => ({
  // Real redirect throws NEXT_REDIRECT; mirror that so control flow matches.
  redirect: vi.fn((url: string) => {
    calls.push(`redirect:${url}`);
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    delete: () => {},
    set: () => {},
  })),
}));

// Minimal chainable Supabase stub: every write resolves with no error.
const okChain = {
  update: () => ({ eq: async () => ({ error: null }) }),
  insert: async () => ({ error: null }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => okChain,
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      signOut: async () => ({ error: null }),
    },
  })),
}));

vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "u1",
    role: "family",
    email: "family@example.com",
    zip_code: null,
    phone: null,
    communication_preference: null,
  })),
}));

import { revalidatePath } from "next/cache";
import { completeFamilyOnboarding } from "@/lib/family/actions";
import { selectRole } from "@/lib/auth/actions";

beforeEach(() => {
  calls.length = 0;
  vi.mocked(revalidatePath).mockClear();
});

describe("gating actions bust the Router Cache before redirecting", () => {
  it("completeFamilyOnboarding revalidates the layout, then redirects", async () => {
    const fd = new FormData();
    fd.set("zip_code", "11779");
    fd.set("communication_preference", "email");
    fd.set("phone", "");
    fd.set("disclaimer_accepted", "on");

    await expect(completeFamilyOnboarding(undefined, fd)).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    // revalidate must come BEFORE the redirect, not after.
    expect(calls).toEqual(["revalidate:/:layout", "redirect:/dashboard"]);
  });

  it("selectRole(family) revalidates the layout, then redirects", async () => {
    const fd = new FormData();
    fd.set("role", "family");

    await expect(selectRole(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(calls).toEqual([
      "revalidate:/:layout",
      "redirect:/onboarding/family",
    ]);
  });
});
