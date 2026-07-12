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
});
