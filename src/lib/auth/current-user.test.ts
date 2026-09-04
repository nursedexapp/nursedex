// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// #847. getCurrentUser is the read every guard in the product sits on, and it
// discarded its error, so a database problem looked exactly like everybody
// signing out at once, with nothing anywhere saying so.
//
// The OUTCOME is deliberately unchanged: null still means "treated as logged
// out", because that is the direction a protective control has to fail, and
// answering with a user we could not read would admit somebody who may be
// suspended. What is new is that the failure is reported.

const h = vi.hoisted(() => ({
  captureException: vi.fn(),
  state: {
    authUser: { id: "u1" } as { id: string } | null,
    row: { id: "u1", is_suspended: false, is_deleted: false } as Record<
      string,
      unknown
    > | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.state.authUser } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = async () =>
        h.state.error
          ? { data: null, error: h.state.error }
          : { data: h.state.row, error: null };
      return b;
    },
  }),
}));

import { getCurrentUser } from "./helpers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.state.authUser = { id: "u1" };
  h.state.row = { id: "u1", is_suspended: false, is_deleted: false };
  h.state.error = null;
});

describe("getCurrentUser", () => {
  it("returns the signed in user", async () => {
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "u1" });
  });

  it("treats a suspended user as logged out", async () => {
    h.state.row = { id: "u1", is_suspended: true, is_deleted: false };
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null when the row cannot be read, which fails closed", async () => {
    h.state.error = { message: "connection reset" };
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("files that failure, so an outage is not silently everybody logging out", async () => {
    h.state.error = { message: "connection reset" };

    await getCurrentUser();

    expect(h.captureException).toHaveBeenCalledTimes(1);
    expect(
      (h.captureException.mock.calls[0][0] as Error).message,
    ).toMatch(/the signed in user's own row failed: connection reset/);
  });

  it("files nothing when the read succeeds", async () => {
    // The positive control: a report on every request is a report nobody reads.
    await getCurrentUser();
    expect(h.captureException).not.toHaveBeenCalled();
  });
});
