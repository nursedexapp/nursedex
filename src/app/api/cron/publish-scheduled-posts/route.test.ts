// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";
import {
  cronRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

const h = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const state: { result: { data: unknown; error: unknown } } = {
    result: { data: [], error: null },
  };
  // Records the filters the route applied so we can assert the query.
  const calls: { eq: unknown[][]; lte: unknown[][] } = { eq: [], lte: [] };
  return { revalidatePath, state, calls };
});

function builder() {
  return createQueryBuilder({
    eq: (...a) => {
      h.calls.eq.push(a);
      return "chain";
    },
    lte: (...a) => {
      h.calls.lte.push(a);
      return "chain";
    },
    select: () => h.state.result,
  });
}

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => builder() }),
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const req = cronRequest();

beforeEach(() => {
  vi.clearAllMocks();
  h.state.result = { data: [], error: null };
  h.calls.eq = [];
  h.calls.lte = [];
});

describe("publish-scheduled-posts cron", () => {
  // Previously this test stubbed verifyCronAuth and asserted the route returned
  // the stub's own 401 object: circular, and blind to the real secret check.
  describeCronAuthGuard({
    GET,
    // Two posts due to go live: an unauthenticated caller reaching the handler
    // would publish them to the public blog.
    seedSideEffect: () => {
      h.state.result = { data: [{ slug: "a" }, { slug: "b" }], error: null };
    },
    sideEffectSpies: { revalidatePath: h.revalidatePath },
  });

  it("publishes due posts and revalidates their pages", async () => {
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
    h.state.result = { data: [], error: null };
    const res = await GET(req);
    expect(await res.json()).toEqual({ published: 0 });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
