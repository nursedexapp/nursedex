import { describe, it, expect, vi } from "vitest";
import {
  CONSENT_RATE_MIN_SHOWN,
  consentNoteText,
  summariseConsentRows,
} from "./consent-tally";

vi.mock("server-only", () => ({}));

describe("summariseConsentRows", () => {
  it("sums each kind and computes the rate", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: 30 },
      { day: "2026-10-15", kind: "shown", count: 10 },
      { day: "2026-10-14", kind: "accepted", count: 12 },
      { day: "2026-10-15", kind: "declined", count: 8 },
    ];
    expect(summariseConsentRows(rows, 30)).toEqual({
      status: "ok", days: 30, shown: 40, accepted: 12, declined: 8, acceptRate: 0.3,
    });
  });

  it("gives no rate below the minimum (L716)", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: CONSENT_RATE_MIN_SHOWN - 1 },
      { day: "2026-10-14", kind: "accepted", count: 5 },
    ];
    expect(summariseConsentRows(rows, 30)).toMatchObject({ status: "ok", acceptRate: null });
  });

  it("refuses counts where answers outnumber showings, rather than print a rate over 100% (L588)", () => {
    const rows = [
      { day: "2026-10-14", kind: "shown", count: 20 },
      { day: "2026-10-14", kind: "accepted", count: 18 },
      { day: "2026-10-14", kind: "declined", count: 5 },
    ];
    expect(summariseConsentRows(rows, 30).status).toBe("error");
  });

  it("skips malformed rows", () => {
    const rows = [{ day: "x", kind: "shown", count: "40" }, { day: "x", kind: "other", count: 4 }, null];
    expect(summariseConsentRows(rows, 30)).toMatchObject({ shown: 0, accepted: 0, declined: 0 });
  });
});

describe("consentNoteText", () => {
  it("says no browsers yet when nothing was counted", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 0, accepted: 0, declined: 0, acceptRate: null }))
      .toBe("No browsers have been shown the banner in the last 30 days. If the site had visitors in that time, the count is not being recorded.");
  });
  it("says when there are too few to read", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 5, accepted: 2, declined: 1, acceptRate: null }))
      .toBe("Too few browsers to read a rate yet (5 shown, 20 needed).");
  });
  it("states what was measured, and no more", () => {
    expect(consentNoteText({ status: "ok", days: 30, shown: 200, accepted: 60, declined: 40, acceptRate: 0.3 }))
      .toBe("30% of browsers shown the banner in the last 30 days accepted on their first answer. PostHog figures since launch come only from browsers that accepted.");
  });
});
