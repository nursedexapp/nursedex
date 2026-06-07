// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const verifyCronAuth = vi.fn();
  const state: { result: { data: unknown; error: unknown } } = {
    result: { data: [], error: null },
  };
  // Records the filters the route applied so we can assert the query.
  const calls: { eq: unknown[][]; lte: unknown[][] } = { eq: [], lte: [] };
  function builder() {
    const b: Record<string, unknown> = {};
    b.update = () => b;
    b.eq = (...a: unknown[]) => {
      calls.eq.push(a);
      return b;
    };
    b.lte = (...a: unknown[]) => {
      calls.lte.push(a);
      return b;
    };
    b.select = () => Promise.resolve(state.result);
    return b;
  }
  return { revalidatePath, verifyCronAuth, state, calls, builder };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: h.verifyCronAuth }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => h.builder() }),
}));

import { GET } from "./route";

const req = {} as Parameters<typeof GET>[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.state.result = { data: [], error: null };
  h.calls.eq = [];
  h.calls.lte = [];
});

describe("publish-scheduled-posts cron", () => {
  it("returns the unauthorized response when the bearer is missing", async () => {
    const unauth = { status: 401 };
    h.verifyCronAuth.mockReturnValue(unauth);
    const res = await GET(req);
    expect(res).toBe(unauth);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("publishes due posts and revalidates their pages", async () => {
    h.verifyCronAuth.mockReturnValue(null);
    h.state.result = { data: [{ slug: "a" }, { slug: "b" }], error: null };

    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({ published: 2 });
    // Only scheduled posts whose publish_at has passed are targeted.
    expect(h.calls.eq).toContainEqual(["status", "scheduled"]);
    expect(h.calls.lte[0][0]).toBe("publish_at");
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog");
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/a");
    expect(h.revalidatePath).toHaveBeenCalledWith("/blog/b");
  });

  it("does not revalidate when nothing is due", async () => {
    h.verifyCronAuth.mockReturnValue(null);
    h.state.result = { data: [], error: null };
    const res = await GET(req);
    expect(await res.json()).toEqual({ published: 0 });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
