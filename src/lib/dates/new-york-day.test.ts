import { describe, it, expect } from "vitest";
import { newYorkDay, newYorkDaysAgo } from "./new-york-day";

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

describe("newYorkDaysAgo", () => {
  it("counts calendar days after a fall back change", () => {
    // 05:30 UTC on 16 Nov 2026 is 00:30 on 16 Nov in New York (EST)
    expect(newYorkDaysAgo(new Date("2026-11-16T05:30:00Z"), 29)).toBe("2026-10-18");
  });
  it("counts calendar days in the last hour of a day after a fall back change", () => {
    // 04:30 UTC on 16 Nov 2026 is 23:30 on 15 Nov in New York (EST); 24 hour steps would say 18 Oct
    expect(newYorkDaysAgo(new Date("2026-11-16T04:30:00Z"), 29)).toBe("2026-10-17");
  });
  it("counts calendar days after a spring forward change", () => {
    // 03:30 UTC on 13 Apr 2027 is 23:30 on 12 Apr in New York (EDT); 24 hour steps would say 13 Mar
    expect(newYorkDaysAgo(new Date("2027-04-13T03:30:00Z"), 29)).toBe("2027-03-14");
  });
  it("crosses month and year boundaries", () => {
    expect(newYorkDaysAgo(new Date("2027-01-05T17:00:00Z"), 29)).toBe("2026-12-07");
    expect(newYorkDaysAgo(new Date("2026-03-01T17:00:00Z"), 1)).toBe("2026-02-28");
  });
  it("returns today for zero days", () => {
    expect(newYorkDaysAgo(new Date("2026-10-14T03:30:00Z"), 0)).toBe("2026-10-13");
  });
});
