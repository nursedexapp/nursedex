// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This endpoint hands back a CSV of every waitlist signup's email address, and
// had no test at all. The role check was correct, but nothing protected it: had
// someone deleted it, the export would have become a public list of every email
// we have collected and no test would have failed.
//
// The guard under test is the route's own signed-in + admin-role check, so it
// runs for real here, along with the real getCurrentUser. The only seam mocked
// is the Supabase client the session is read through (#634: a test must never
// mock away the guard it exists to verify).

const h = vi.hoisted(() => {
  const state = {
    // The users row for the caller. null = signed out.
    user: null as Record<string, unknown> | null,
    waitlist: [] as unknown[],
  };
  // The waitlist read itself. A refused caller must never reach it: returning
  // 401 while still querying the table would still be a leak in the making.
  const readWaitlist = vi.fn(() => ({ data: state.waitlist, error: null }));
  return { state, readWaitlist };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.state.user ? { id: h.state.user.id } : null },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: h.state.user, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => h.readWaitlist(),
      }),
    }),
  }),
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
  h.state.waitlist = [
    {
      email: "signup@example.com",
      role: "family",
      referral_source: "google",
      created_at: "2026-07-01T00:00:00.000Z",
    },
  ];
});

async function get() {
  const { GET } = await import("./route");
  return GET();
}

describe("waitlist export: only a signed-in admin gets the list", () => {
  it("refuses a signed-out caller with 401 and never reads the waitlist", async () => {
    setCaller(null);

    const res = await get();

    expect(res.status).toBe(401);
    expect(h.readWaitlist).not.toHaveBeenCalled();
  });

  it.each(["family", "nurse"])(
    "refuses a %s caller with 403 and never reads the waitlist",
    async (role) => {
      setCaller(role);

      const res = await get();

      expect(res.status).toBe(403);
      expect(h.readWaitlist).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "super_admin"])("returns the CSV to a %s", async (role) => {
    setCaller(role);

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(await res.text()).toContain("signup@example.com");
  });
});

describe("waitlist export: no secret in the URL", () => {
  // The route used to accept ?key=<ADMIN_SECRET> as a login-free bypass, which
  // returned this CSV to anyone holding the link. A secret in a query string is
  // written to server access logs, proxy logs and browser history, and is
  // forwarded in the Referer header, so one leaked link exposed every email
  // address we have collected. It granted nothing an admin lacked. Removed with
  // the owner's sign-off.
  //
  // The behavioural tests above already prove a non-admin is refused. This one
  // guards the shape of the fix: re-introducing a query-string secret would
  // reopen the leak while those tests stayed green, because a bypass is
  // authorized BEFORE the role check ever runs.
  it("reads no secret from the query string", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "route.ts"),
      "utf8",
    );

    // The doc comment names ADMIN_SECRET to explain why it is gone, so match the
    // code that would actually read one, not the mention of it.
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("process.env.ADMIN_SECRET");
  });
});
