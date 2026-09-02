// @vitest-environment node
//
// Which flagged families count as flagged NOW (#425).
//
// A family is flagged after three consecutive days of tripping the captcha
// threshold, and the row recording that stays in rate_limit_reveals forever.
// Without a window, the admin digest counted every family ever flagged and
// mailed that count daily whether or not anybody was still doing it, so the
// number never went back to zero and stopped meaning anything.
import { describe, it, expect } from "vitest";
import { FLAGGED_RECENT_DAYS, flaggedSinceDate } from "./flagged";

describe("flaggedSinceDate", () => {
  it("starts the window so that today is inside it", () => {
    const since = flaggedSinceDate(new Date("2026-09-01T05:00:00Z"));
    expect(since <= "2026-09-01").toBe(true);
  });

  it("spans exactly the configured number of days, today included", () => {
    // 7 days ending today means the earliest day inside it is 6 days back.
    expect(flaggedSinceDate(new Date("2026-09-10T05:00:00Z"))).toBe(
      "2026-09-04",
    );
    expect(FLAGGED_RECENT_DAYS).toBe(7);
  });

  it("crosses a month boundary by the calendar, not by arithmetic on the day number", () => {
    expect(flaggedSinceDate(new Date("2026-03-03T00:30:00Z"))).toBe(
      "2026-02-25",
    );
  });

  /**
   * The rows are keyed on CURRENT_DATE in the database, which is UTC, so the
   * window has to be computed in UTC too. Deriving it from local time would
   * shift the boundary by a day for anyone running this outside UTC, and the
   * digest would then count a different set of families depending on where the
   * machine was (L39).
   */
  it("is computed in UTC, so it does not move with the machine's timezone", () => {
    // Late evening in New York is already the next day in UTC.
    const lateInNewYork = new Date("2026-09-10T23:30:00-04:00");
    expect(flaggedSinceDate(lateInNewYork)).toBe("2026-09-05");
  });
});
