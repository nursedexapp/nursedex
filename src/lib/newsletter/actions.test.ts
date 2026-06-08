// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => ({ insert }) }),
}));

import { subscribeNewsletter } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
});

describe("subscribeNewsletter", () => {
  it("stores a normalized email with its source", async () => {
    const res = await subscribeNewsletter({
      email: " Reader@Example.com ",
      source: "blog_post",
    });
    expect(res.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      email: "reader@example.com",
      source: "blog_post",
    });
  });

  it("treats an already-subscribed email (23505) as success", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    expect((await subscribeNewsletter({ email: "a@b.com" })).success).toBe(true);
  });

  it("silently drops a filled honeypot without storing", async () => {
    const res = await subscribeNewsletter({ email: "a@b.com", website: "spam" });
    expect(res.success).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with field errors and does not store", async () => {
    const res = await subscribeNewsletter({ email: "not-an-email" });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an unknown error on a non-duplicate failure", async () => {
    insert.mockResolvedValue({ error: { code: "500", message: "boom" } });
    const res = await subscribeNewsletter({ email: "a@b.com" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("unknown");
  });
});
