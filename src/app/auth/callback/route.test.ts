// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Regression guard for the open-redirect in /auth/callback (issue #392):
 * `next` was appended straight into `${origin}${next}` with no validation,
 * so `next=@evil.com` parsed the origin as userinfo and bounced the user
 * off-site after a real code/token exchange.
 */

const h = vi.hoisted(() => ({
  scenario: {
    exchangeError: null as { message: string } | null,
    verifyOtpError: null as { message: string } | null,
    user: null as { id: string } | null,
    role: null as string | null,
    // Rows the tos_accepted_at update actually touched. Non-empty means this
    // is the first confirmation, which is what tells signup_completed apart
    // from a repeat login (#864).
    firstConfirmation: [] as { id: string }[],
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: h.scenario.exchangeError }),
      verifyOtp: async () => ({ error: h.scenario.verifyOtpError }),
      getUser: async () => ({ data: { user: h.scenario.user } }),
    },
    from: () => ({
      update: () => ({
        eq: () => ({
          is: () => ({ select: async () => ({ data: h.scenario.firstConfirmation }) }),
        }),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: h.scenario.role ? { role: h.scenario.role } : null,
          }),
        }),
      }),
    }),
  })),
}));

import { GET } from "./route";

function req(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

beforeEach(() => {
  h.scenario.exchangeError = null;
  h.scenario.verifyOtpError = null;
  h.scenario.user = { id: "u1" };
  h.scenario.role = "family";
});

describe("/auth/callback next-param validation", () => {
  it.each(["@evil.com", "//evil.com", "https://evil.com", "/\\evil.com"])(
    "drops an unsafe next (%s) and falls back to the role/dashboard redirect",
    async (unsafeNext) => {
      const res = await GET(
        req(`https://nursedex.com/auth/callback?code=abc&next=${encodeURIComponent(unsafeNext)}`),
      );
      const location = res.headers.get("Location");

      expect(location).toBe("https://nursedex.com/dashboard");
    },
  );

  it("honors a safe same-origin next", async () => {
    const res = await GET(
      req("https://nursedex.com/auth/callback?code=abc&next=/reset-password"),
    );

    expect(res.headers.get("Location")).toBe("https://nursedex.com/reset-password");
    expect(res.cookies.get("nursedex_pw_recovery")?.value).toBe("1");
  });

  it("falls back to /role-select when no safe next and no role yet", async () => {
    h.scenario.role = null;
    const res = await GET(req("https://nursedex.com/auth/callback?code=abc"));

    expect(res.headers.get("Location")).toBe("https://nursedex.com/role-select");
  });
});
