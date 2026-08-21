// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// #444. signInWithGoogle did `if (error) { return; }`: it swallowed the Supabase
// error whole, returned void, and never redirected. The caller could not tell a
// failed sign-in from a successful one, so the button spun forever. It had the
// same dead end when data.url came back empty with no error at all.

const h = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOAuth: h.signInWithOAuth } }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
}));
vi.mock("@/lib/email/send", () => ({ sendAccountExistsNoticeEmail: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithGoogle", () => {
  it("redirects to Google when sign-in starts", async () => {
    h.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" },
      error: null,
    });
    const { signInWithGoogle } = await import("./actions");

    await expect(signInWithGoogle()).rejects.toThrow(
      "NEXT_REDIRECT:https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
  });

  it("returns the failure instead of swallowing it", async () => {
    h.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "provider is not enabled" },
    });
    const { signInWithGoogle } = await import("./actions");

    const result = await signInWithGoogle();

    expect(result?.error).toBeTruthy();
  });

  it("returns a failure when Supabase reports no error but hands back no URL", async () => {
    // The quieter dead end: no error to log, nothing to redirect to, and the old
    // code returned void here too, which the button read as "still working".
    h.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    const { signInWithGoogle } = await import("./actions");

    const result = await signInWithGoogle();

    expect(result?.error).toBeTruthy();
  });

  it("does not leak the provider's raw message to the user", async () => {
    h.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "invalid client_secret 8f3a2b" },
    });
    const { signInWithGoogle } = await import("./actions");

    const result = await signInWithGoogle();

    expect(result?.error).not.toContain("client_secret");
  });

  // #742. Two parameters were being sent that nothing in this codebase acts on.
  // access_type: "offline" asks Google for a refresh token, and prompt:
  // "consent" forces the consent screen every single time so that the refresh
  // token is reissued. Nothing ever reads provider_token or
  // provider_refresh_token, so the refresh token was requested, stored by
  // Supabase, and never used, while the price was paid by every returning user:
  // a full "You're signing back in to..." interstitial on each sign-in.

  async function optionsPassedToGoogle() {
    h.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" },
      error: null,
    });
    const { signInWithGoogle } = await import("./actions");
    await signInWithGoogle().catch(() => {}); // the redirect throw is expected
    return h.signInWithOAuth.mock.calls[0]?.[0]?.options ?? {};
  }

  it("does not force the consent screen on people who have signed in before", async () => {
    const options = await optionsPassedToGoogle();

    // Asserting the RULE, not one spelling of it: any prompt value that forces
    // an interstitial is wrong here, not merely the literal "consent".
    const prompt = options.queryParams?.prompt;
    expect(prompt).not.toBe("consent");
    expect(prompt).not.toBe("login");
    expect(prompt).not.toBe("select_account consent");
  });

  it("does not ask Google for a refresh token it never reads", async () => {
    const options = await optionsPassedToGoogle();

    expect(options.queryParams?.access_type).not.toBe("offline");
  });

  it("still sends the user somewhere Google can authenticate them", async () => {
    // A positive control. Both assertions above are satisfied by passing no
    // options at all, or by breaking the call outright, so prove the sign-in
    // still actually happens in the same fixture.
    const options = await optionsPassedToGoogle();

    expect(h.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    expect(options.redirectTo).toContain("/auth/callback");
  });
});
