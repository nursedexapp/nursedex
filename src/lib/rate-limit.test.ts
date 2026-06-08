// @vitest-environment node
import { describe, it, expect } from "vitest";
import { clientIpFrom, hashIp } from "./rate-limit";

describe("clientIpFrom", () => {
  it("takes the first IP and trims it", () => {
    expect(clientIpFrom("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
    expect(clientIpFrom("  9.9.9.9  ")).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' for empty input", () => {
    expect(clientIpFrom(null)).toBe("unknown");
    expect(clientIpFrom("")).toBe("unknown");
    expect(clientIpFrom(undefined)).toBe("unknown");
  });
});

describe("hashIp", () => {
  it("is deterministic and not the raw IP", async () => {
    const a = await hashIp("1.2.3.4");
    const b = await hashIp("1.2.3.4");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(await hashIp("9.9.9.9")).not.toBe(a);
  });
});
