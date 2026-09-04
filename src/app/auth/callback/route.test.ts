// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  captureServerEventAfterResponse: vi.fn(),
  captureException: vi.fn(),
  state: {
    // The TOS write's result. Its `.is("tos_accepted_at", null)` filter means
    // it touches a row exactly once, on the first confirmation, which is the
    // only trustworthy signal that a signup COMPLETED rather than a repeat
    // click that is really a login.
    tosRows: [] as Array<{ id: string }>,
    tosError: null as { message: string } | null,
    role: "nurse" as string | null,
    roleError: null as { message: string } | null,
  },
}));

vi.mock("@/lib/analytics/server", () => ({
  captureServerEventAfterResponse: h.captureServerEventAfterResponse,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: () => {
      let updating = false;
      const b: Record<string, unknown> = {};
      b.update = () => {
        updating = true;
        return b;
      };
      b.eq = () => b;
      b.is = () => b;
      b.select = () =>
        updating
          ? Promise.resolve(
              h.state.tosError
                ? { data: null, error: h.state.tosError }
                : { data: h.state.tosRows, error: null },
            )
          : b;
      b.maybeSingle = () =>
        Promise.resolve(
          h.state.roleError
            ? { data: null, error: h.state.roleError }
            : { data: h.state.role ? { role: h.state.role } : null, error: null },
        );
      return b;
    },
  }),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

function callback(): NextRequest {
  return new NextRequest("https://nursedex.com/auth/callback?code=abc");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.state.tosRows = [{ id: "u1" }];
  h.state.tosError = null;
  h.state.role = "nurse";
  h.state.roleError = null;
});

describe("recording terms acceptance on a confirming signup", () => {
  it("records a signup when the write touched a row", async () => {
    await GET(callback());

    expect(h.captureServerEventAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({ event: "signup_completed" }),
    );
  });

  it("records a login when the write touched no row", async () => {
    h.state.tosRows = [];

    await GET(callback());

    expect(h.captureServerEventAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({ event: "login" }),
    );
  });

  it("sends NO event when the write failed, rather than guessing which it was", async () => {
    // The database decides which event this is, so a failed write cannot say.
    // A wrong signup or login count is worse than a missing one: it is
    // indistinguishable from a real event and nothing can tell it apart.
    h.state.tosError = { message: "connection reset" };

    await GET(callback());

    expect(h.captureServerEventAfterResponse).not.toHaveBeenCalled();
  });

  it("still signs the person in when that write failed", async () => {
    // exchangeCodeForSession has already set the session cookie, so refusing
    // here would show an error page to somebody who is signed in anyway.
    h.state.tosError = { message: "connection reset" };

    const res = await GET(callback());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://nursedex.com/dashboard");
  });

  it("reports the failed write, since nothing throws for the handler to see", async () => {
    h.state.tosError = { message: "connection reset" };

    await GET(callback());

    expect(h.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("choosing where to send someone after they sign in", () => {
  it("sends a user with a role to the dashboard", async () => {
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("https://nursedex.com/dashboard");
  });

  it("sends a user with no role to role select", async () => {
    h.state.role = null;
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe(
      "https://nursedex.com/role-select",
    );
  });

  it("refuses when the role cannot be read, rather than asking again", async () => {
    // Unlike the write above, this one throws: role-select would ask somebody
    // who already has a role to choose one again, and there is no safe default.
    h.state.roleError = { message: "connection reset" };

    await expect(GET(callback())).rejects.toThrow(
      /the role of a signing in user could not be read/,
    );
  });
});
