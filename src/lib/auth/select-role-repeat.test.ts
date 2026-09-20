import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Pressing Continue on the role select screen a second time must not fail.
 *
 * The button offers a retry when the first attempt is slow, and the first
 * attempt can already have created the profile. The second insert then hits
 * the one profile per account constraint, and that used to be reported as a
 * failure: the person saw "could not complete" on an account that was fully
 * set up, stayed on the screen, and Sentry raised NURSEDEX-SITE-Z
 * (2026-09-16). A duplicate on the user_id key means the work is done, so it
 * carries on to the next screen. Any other duplicate is still a failure.
 */

const { state } = vi.hoisted(() => ({
  state: {
    insertError: null as { code: string; message: string } | null,
    redirects: [] as string[],
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    state.redirects.push(url);
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { first_name: "Ada", last_name: "Lovelace" },
            error: null,
          }),
        }),
      }),
      insert: async () => ({ data: null, error: state.insertError }),
    }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  })),
}));

import * as Sentry from "@sentry/nextjs";
import { selectRole } from "@/lib/auth/actions";

function duplicateOn(constraint: string) {
  return {
    code: "23505",
    message: `duplicate key value violates unique constraint "${constraint}"`,
  };
}

function roleForm(role: "nurse" | "family") {
  const fd = new FormData();
  fd.set("role", role);
  return fd;
}

beforeEach(() => {
  state.insertError = null;
  state.redirects.length = 0;
  vi.mocked(Sentry.captureException).mockClear();
});

describe("selectRole pressed again after the profile exists", () => {
  it("sends a nurse on to the dashboard without reporting a failure", async () => {
    state.insertError = duplicateOn("nurse_profiles_user_id_key");

    await expect(selectRole(roleForm("nurse"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(state.redirects).toEqual(["/dashboard"]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("sends a family on to onboarding without reporting a failure", async () => {
    state.insertError = duplicateOn("family_profiles_user_id_key");

    await expect(selectRole(roleForm("family"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(state.redirects).toEqual(["/onboarding/family"]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("still refuses and reports a duplicate on any other key", async () => {
    state.insertError = duplicateOn("nurse_profiles_slug_key");

    const result = await selectRole(roleForm("nurse"));

    expect(result).toEqual({ error: expect.any(String) });
    expect(state.redirects).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
