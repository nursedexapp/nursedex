import { describe, it, expect } from "vitest";
import { newYorkDay } from "./new-york-day";

describe("newYorkDay", () => {
  it("uses the New York calendar day, not UTC", () => {
    // 03:30 UTC on 14 Oct is 23:30 on 13 Oct in New York (EDT)
    expect(newYorkDay(new Date("2026-10-14T03:30:00Z"))).toBe("2026-10-13");
  });
  it("crosses into winter time correctly", () => {
    // 04:30 UTC on 2 Nov 2026 is 23:30 on 1 Nov in New York (EST)
    expect(newYorkDay(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01");
  });
});
