import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard for the silent duplicate-signup fix (PR #149).
 *
 * Supabase's auth.signUp returns no error for an email that already belongs to
 * a confirmed account (it obfuscates the response to prevent enumeration), so
 * the action must detect the duplicate via an authoritative auth.users lookup
 * and email the owner instead of stranding them on a "check your email" page.
 *
 * The security-critical properties these tests pin:
 *   - A confirmed duplicate never reaches signUp, and the on-screen result is
 *     byte-for-byte identical to the new-user path (no email enumeration).
 *   - Brand-new and existing-unconfirmed emails still flow through signUp.
 *   - resendConfirmation no longer returns a distinct "already confirmed"
 *     message that could be used to probe registered emails.
 */

// Hoisted shared state the mock factories read/write (factories run before
// the imports below).
const h = vi.hoisted(() => ({
  scenario: {
    blocked: null as { id: string } | null,
    // public.users mirror row (exists for any signed-up user, confirmed or not)
    profile: null as { id: string; first_name: string | null } | null,
    // what the GoTrue admin API (getUserById) returns as the auth user
    authUser: null as { email_confirmed_at: string | null } | null,
  },
  signUpResult: { error: null as { message: string } | null },
  resendResult: { error: null as { message: string } | null },
  signUp: vi.fn(),
  resend: vi.fn(),
  sendNotice: vi.fn<(arg: { to: string; firstName?: string }) => Promise<void>>(
    async () => {},
  ),
  afterTasks: [] as Promise<unknown>[],
}));

type Builder = {
  from: (t: string) => Builder;
  select: () => Builder;
  eq: () => Builder;
  maybeSingle: () => Promise<{ data: unknown }>;
};

// Mock service-role so importing auth/actions doesn't pull in `server-only`
// (not resolvable under vitest). Routes the public-schema lookups by table and
// serves the auth user through the GoTrue admin API (getUserById), mirroring
// how the action actually reads confirmation status. The auth schema is not
// exposed to PostgREST, so there is deliberately no .schema("auth") here.
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => {
    const makeBuilder = (): Builder => {
      let table: string | null = null;
      const b: Builder = {
        from: (t: string) => {
          table = t;
          return b;
        },
        select: () => b,
        eq: () => b,
        maybeSingle: async () => {
          if (table === "blocked_emails") return { data: h.scenario.blocked };
          if (table === "users") return { data: h.scenario.profile };
          return { data: null };
        },
      };
      return b;
    };
    return {
      from: (t: string) => makeBuilder().from(t),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: h.scenario.authUser } }),
        },
      },
    };
  }),
}));

// Anon client: only its auth.signUp / auth.resend are exercised here.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: () => {
        h.signUp();
        return Promise.resolve(h.signUpResult);
      },
      resend: () => {
        h.resend();
        return Promise.resolve(h.resendResult);
      },
    },
  })),
}));

vi.mock("@/lib/email/send", () => ({
  sendAccountExistsNoticeEmail: (arg: { to: string; firstName?: string }) =>
    h.sendNotice(arg),
}));

// after() runs its callback after the response is sent; invoke it eagerly and
// collect the promise so tests can await the dispatched email.
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    h.afterTasks.push(Promise.resolve().then(() => fn()));
  },
}));

// Imported by the module but unused by the actions under test; stub so the
// module loads cleanly under vitest.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { signUp, resendConfirmation } from "@/lib/auth/actions";

const GENERIC_SIGNUP_SUCCESS = "Check your email for a confirmation link.";
const GENERIC_RESEND_SUCCESS = "Confirmation email sent. Check your inbox.";

function signupForm(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", "supersecret123");
  fd.set("tos", "on");
  return fd;
}

async function flushAfter(): Promise<void> {
  await Promise.all(h.afterTasks);
}

beforeEach(() => {
  h.scenario.blocked = null;
  h.scenario.authUser = null;
  h.scenario.profile = null;
  h.signUpResult.error = null;
  h.resendResult.error = null;
  h.signUp.mockClear();
  h.resend.mockClear();
  h.sendNotice.mockClear();
  h.afterTasks.length = 0;
});

describe("signUp duplicate-email handling", () => {
  it("new email calls signUp, sends no notice, returns generic success", async () => {
    const result = await signUp(signupForm("new@example.com"));
    await flushAfter();

    expect(h.signUp).toHaveBeenCalledTimes(1);
    expect(h.sendNotice).not.toHaveBeenCalled();
    expect(result).toEqual({ success: GENERIC_SIGNUP_SUCCESS });
  });

  it("existing unconfirmed email still flows through signUp (resends), no notice", async () => {
    h.scenario.profile = { id: "u1", first_name: "Dana" };
    h.scenario.authUser = { email_confirmed_at: null };

    const result = await signUp(signupForm("pending@example.com"));
    await flushAfter();

    expect(h.signUp).toHaveBeenCalledTimes(1);
    expect(h.sendNotice).not.toHaveBeenCalled();
    expect(result).toEqual({ success: GENERIC_SIGNUP_SUCCESS });
  });

  it("confirmed duplicate skips signUp, emails the owner, and returns the SAME generic success", async () => {
    h.scenario.profile = { id: "u1", first_name: "Dana" };
    h.scenario.authUser = { email_confirmed_at: "2026-01-01T00:00:00Z" };

    const result = await signUp(signupForm("Owner@Example.com"));
    await flushAfter();

    expect(h.signUp).not.toHaveBeenCalled();
    // Email goes to the lowercased address, with the owner's first name.
    expect(h.sendNotice).toHaveBeenCalledWith({
      to: "owner@example.com",
      firstName: "Dana",
    });
    // Identical to the new-user response above → nothing to enumerate.
    expect(result).toEqual({ success: GENERIC_SIGNUP_SUCCESS });
  });

  it("confirmed duplicate with no profile name sends notice with firstName undefined", async () => {
    h.scenario.profile = { id: "u1", first_name: null };
    h.scenario.authUser = { email_confirmed_at: "2026-01-01T00:00:00Z" };

    await signUp(signupForm("owner2@example.com"));
    await flushAfter();

    expect(h.sendNotice).toHaveBeenCalledWith({
      to: "owner2@example.com",
      firstName: undefined,
    });
  });

  it("blocked email returns the blocked error and never calls signUp or notice", async () => {
    h.scenario.blocked = { id: "b1" };

    const result = await signUp(signupForm("blocked@example.com"));
    await flushAfter();

    expect(h.signUp).not.toHaveBeenCalled();
    expect(h.sendNotice).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "This email address cannot be used to create an account.",
    });
  });
});

describe("resendConfirmation hardening", () => {
  it("already-confirmed account sends notice and returns generic success (no leak)", async () => {
    h.scenario.profile = { id: "u1", first_name: null };
    h.scenario.authUser = { email_confirmed_at: "2026-01-01T00:00:00Z" };

    const fd = new FormData();
    fd.set("email", "Owner@Example.com");
    const result = await resendConfirmation(fd);
    await flushAfter();

    expect(h.resend).not.toHaveBeenCalled();
    expect(h.sendNotice).toHaveBeenCalledWith({ to: "owner@example.com" });
    expect(result).toEqual({ success: GENERIC_RESEND_SUCCESS });
    // Must not reveal that the account exists and is confirmed.
    expect(result.error).toBeUndefined();
  });

  it("unconfirmed account calls resend and sends no notice", async () => {
    h.scenario.profile = { id: "u1", first_name: null };
    h.scenario.authUser = { email_confirmed_at: null };

    const fd = new FormData();
    fd.set("email", "pending@example.com");
    const result = await resendConfirmation(fd);
    await flushAfter();

    expect(h.resend).toHaveBeenCalledTimes(1);
    expect(h.sendNotice).not.toHaveBeenCalled();
    expect(result).toEqual({ success: GENERIC_RESEND_SUCCESS });
  });
});
