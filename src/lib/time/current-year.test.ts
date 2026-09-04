import { describe, it, expect } from "vitest";
import { currentYear } from "./current-year";

describe("currentYear", () => {
  it("reads the year off the clock it is given", () => {
    expect(currentYear(new Date("2026-06-15T12:00:00Z"))).toBe(2026);
  });

  it("rolls over at the turn of the year rather than lagging a day", () => {
    expect(currentYear(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
    expect(currentYear(new Date("2027-01-01T00:00:01Z"))).toBe(2027);
  });

  it("defaults to now when no clock is supplied", () => {
    expect(currentYear()).toBe(new Date().getUTCFullYear());
  });

  it("answers in UTC, so the host's own timezone cannot change it", () => {
    // 2027-01-01T02:00Z is still 2026 in New York. A local-time reading would
    // answer 2026 on this machine and 2027 on Vercel, for the same instant.
    expect(currentYear(new Date("2027-01-01T02:00:00Z"))).toBe(2027);
  });
});
