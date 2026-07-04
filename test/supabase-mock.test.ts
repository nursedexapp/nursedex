import { describe, it, expect, vi } from "vitest";
import { createQueryBuilder } from "./supabase-mock";

describe("createQueryBuilder", () => {
  it("chains filter methods with no handler configured", () => {
    const b = createQueryBuilder();
    expect(b.select().eq("id", "1").order("created_at")).toBe(b);
  });

  it("resolves a configured terminal method", async () => {
    const b = createQueryBuilder({
      maybeSingle: () => ({ data: { id: "1" } }),
    });
    await expect(b.select().eq("id", "1").maybeSingle()).resolves.toEqual({
      data: { id: "1" },
    });
  });

  it("passes call arguments through to the handler", async () => {
    const insert = vi.fn(() => ({ error: null }));
    const b = createQueryBuilder({ insert });
    await b.insert({ email: "a@b.com" });
    expect(insert).toHaveBeenCalledWith({ email: "a@b.com" });
  });

  it("keeps chaining when a handler returns the chain sentinel", () => {
    const b = createQueryBuilder({ update: () => "chain" });
    expect(b.update({ x: 1 }).eq("id", "1")).toBe(b);
  });

  it("supports being awaited directly via a thenable handler", async () => {
    const b = createQueryBuilder({ then: () => ({ count: 3, error: null }) });
    await expect(b.select().eq("id", "1")).resolves.toEqual({
      count: 3,
      error: null,
    });
  });
});
