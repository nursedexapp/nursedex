import { describe, it, expect } from "vitest";
import {
  getSlaState,
  compareVerificationQueueRows,
  SLA_HOURS,
} from "@/lib/admin/sla";

describe("getSlaState", () => {
  it("returns 'ok' well before the SLA", () => {
    expect(getSlaState(0, SLA_HOURS.free)).toBe("ok");
    expect(getSlaState(10, SLA_HOURS.free)).toBe("ok");
  });

  it("flips to 'approaching' at 75% of the SLA", () => {
    const seventyFive = SLA_HOURS.featured * 0.75;
    expect(getSlaState(seventyFive - 0.1, SLA_HOURS.featured)).toBe("ok");
    expect(getSlaState(seventyFive, SLA_HOURS.featured)).toBe("approaching");
  });

  it("flips to 'overdue' at the SLA itself", () => {
    expect(getSlaState(SLA_HOURS.featured - 0.1, SLA_HOURS.featured)).toBe(
      "approaching",
    );
    expect(getSlaState(SLA_HOURS.featured, SLA_HOURS.featured)).toBe("overdue");
    expect(getSlaState(SLA_HOURS.featured + 12, SLA_HOURS.featured)).toBe(
      "overdue",
    );
  });
});

describe("compareVerificationQueueRows", () => {
  const make = (
    tier: "free" | "featured",
    iso: string,
  ): { tier: "free" | "featured"; submitted_at: string } => ({
    tier,
    submitted_at: iso,
  });

  it("places Featured before Free regardless of submission age", () => {
    const featuredYoung = make("featured", "2026-05-03T10:00:00Z");
    const freeOlder = make("free", "2026-05-01T10:00:00Z");
    const sorted = [freeOlder, featuredYoung].sort(
      compareVerificationQueueRows,
    );
    expect(sorted[0]).toBe(featuredYoung);
  });

  it("FIFO within a tier (oldest first)", () => {
    const newer = make("free", "2026-05-03T10:00:00Z");
    const older = make("free", "2026-05-01T10:00:00Z");
    const sorted = [newer, older].sort(compareVerificationQueueRows);
    expect(sorted[0]).toBe(older);
  });

  it("sorts a mixed batch correctly", () => {
    const a = make("featured", "2026-05-03T10:00:00Z");
    const b = make("featured", "2026-05-01T10:00:00Z");
    const c = make("free", "2026-04-30T10:00:00Z");
    const d = make("free", "2026-05-02T10:00:00Z");
    const sorted = [a, b, c, d].sort(compareVerificationQueueRows);
    expect(sorted).toEqual([b, a, c, d]);
  });
});
