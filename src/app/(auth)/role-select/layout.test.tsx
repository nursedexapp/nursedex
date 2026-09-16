// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Somebody who already has a role must never be shown the role select screen.
 *
 * A role cannot change once it is set (the database refuses it), so the only
 * thing that screen can do for them is fail: picking the other role returned
 * "could not complete", left them stuck there, and raised a false Sentry
 * alert (#1087). They reach it by the back button, a bookmark or the progress
 * link. They go to /dashboard, which already routes every role onward (admins
 * to /admin, an unfinished family to onboarding).
 *
 * The real guard runs: the only seam mocked is the Supabase client the
 * session and the users row are read through.
 */

const h = vi.hoisted(() => ({
  state: { user: null as Record<string, unknown> | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = () => Promise.resolve({ data: h.state.user, error: null });
      return b;
    },
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: h.state.user ? { id: h.state.user.id } : null },
        }),
    },
  }),
}));

import RoleSelectLayout from "./layout";

function signedInAs(role: string | null) {
  h.state.user = {
    id: "11111111-1111-4111-8111-111111111111",
    role,
    is_suspended: false,
    is_deleted: false,
  };
}

async function landing(): Promise<string | undefined> {
  try {
    await RoleSelectLayout({ children: null });
  } catch (err) {
    return (err as Error).message;
  }
  return undefined;
}

beforeEach(() => {
  h.state.user = null;
});

describe("role select layout", () => {
  it.each(["nurse", "family", "admin", "super_admin"])(
    "sends somebody who is already %s to the dashboard",
    async (role) => {
      signedInAs(role);
      expect(await landing()).toBe("NEXT_REDIRECT:/dashboard");
    },
  );

  it("shows the screen to somebody with no role yet", async () => {
    signedInAs(null);
    expect(await landing()).toBeUndefined();
  });

  it("still sends a signed out visitor to login", async () => {
    expect(await landing()).toBe("NEXT_REDIRECT:/login");
  });
});
