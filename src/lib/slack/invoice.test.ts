// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = { rows: [] as unknown[] };
  const posts: { method: string; payload: Record<string, unknown> }[] = [];
  return { state, posts };
});

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({
  slackPost: async (method: string, payload: Record<string, unknown>) => {
    h.posts.push({ method, payload });
    return { ok: true };
  },
}));
vi.mock("./constants", () => ({
  OPS_CHANNEL_ID: "C-OPS",
  INVOICE_NOTIFY_USER_IDS: ["U1"],
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.gte = () => b;
      b.lt = () => Promise.resolve({ data: h.state.rows, error: null });
      return b;
    },
  }),
}));

import { generateAndPostInvoice } from "./invoice";

function entry(id: number, minutes: number | null, rate: number | null) {
  return {
    billed_min: minutes,
    request: { id, title: `Request ${id}`, rate, type: "task" },
  };
}

function postedText(): string {
  return h.posts.map((p) => JSON.stringify(p.payload)).join("\n");
}

beforeEach(() => {
  h.state.rows = [];
  h.posts.length = 0;
});

describe("the monthly invoice post", () => {
  it("posts when there is money to bill", async () => {
    h.state.rows = [entry(1, 120, 75)];
    const result = await generateAndPostInvoice("2026-06");

    expect(result.posted).toBe(true);
    expect(result.total).toBe(150);
    expect(h.posts).toHaveLength(1);
    expect(postedText()).toContain("invoice ready to send");
  });

  it("posts nothing when the month has no time entries at all", async () => {
    const result = await generateAndPostInvoice("2026-06");

    expect(result.posted).toBe(false);
    expect(result.total).toBe(0);
    expect(h.posts).toHaveLength(0);
  });

  // The July 1 2026 alert that opened #383: one request, billed 0.00 hrs, and
  // the "invoice ready to send" ping fired anyway. A grouped request with zero
  // minutes made fields.length 1, so the old guard on fields.length never
  // tripped.
  it("posts nothing when every request billed zero minutes", async () => {
    h.state.rows = [entry(3, 0, 75), entry(4, null, 75)];
    const result = await generateAndPostInvoice("2026-06");

    expect(result.posted).toBe(false);
    expect(result.total).toBe(0);
    expect(h.posts).toHaveLength(0);
  });

  // Hours were worked and the total is still zero, which is a rate that was
  // never set rather than a quiet month. Staying silent here would hide a
  // billing error behind the same silence as an empty month.
  it("says so when hours were logged but the rate is missing", async () => {
    h.state.rows = [entry(5, 180, null)];
    const result = await generateAndPostInvoice("2026-06");

    expect(result.posted).toBe(true);
    expect(result.total).toBe(0);
    expect(h.posts).toHaveLength(1);
    const text = postedText();
    expect(text).toContain("3.00");
    expect(text).not.toContain("invoice ready to send");
  });
});
