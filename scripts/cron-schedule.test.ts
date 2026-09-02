// @vitest-environment node
//
// How the crons are spread across the clock (#409).
//
// Five of the thirteen fired in the same minute, and three more in another.
// Each one opens its own service-role client and iterates rows, so the day's
// work arrived in two bursts against one database rather than spread out, and
// a slow minute made every job in that minute slow at once.
//
// This asks vercel.json rather than a list kept here, so a cron added later is
// held to the same rule.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectVercelCronJobs, expectedIntervalMs } from "./scheduled-jobs";

const CRONS = collectVercelCronJobs(readFileSync("vercel.json", "utf8"));

/** The minute of the day a schedule fires, or null when it fires many times. */
function fixedMinuteOfDay(expression: string): number | null {
  const [minute, hour] = expression.trim().split(/\s+/);
  if (minute.includes("*") || hour.includes("*")) return null;
  if (minute.includes(",") || hour.includes(",")) return null;
  return Number(hour) * 60 + Number(minute);
}

describe("the cron schedule", () => {
  it("has crons to check, so this is not asserting over an empty list", () => {
    expect(CRONS.length).toBeGreaterThan(10);
  });

  it("gives every job whose time is fixed a minute of its own", () => {
    const byMinute = new Map<number, string[]>();

    for (const cron of CRONS) {
      const minute = fixedMinuteOfDay(cron.crons[0]);
      if (minute === null) continue;
      byMinute.set(minute, [...(byMinute.get(minute) ?? []), cron.name]);
    }

    const shared = [...byMinute.entries()].filter(
      ([, names]) => names.length > 1,
    );

    expect(
      shared,
      `these jobs fire in the same minute: ${shared
        .map(([minute, names]) => `${minute} (${names.join(", ")})`)
        .join("; ")}`,
    ).toEqual([]);
  });

  /**
   * Spreading them must not change how often any of them runs. A stagger that
   * quietly turned a daily job into a weekly one would leave everything
   * downstream (dunning, expiry, reminders) running a seventh as often, with
   * the watchdog perfectly happy because it derives its expectation from the
   * same changed expression.
   */
  it.each(CRONS.map((c) => [c.name, c.crons] as const))(
    "%s still runs at least weekly",
    (_name, crons) => {
      expect(expectedIntervalMs([...crons])).toBeLessThanOrEqual(
        31 * 24 * 60 * 60 * 1000,
      );
    },
  );

  /**
   * Each route's own docstring states the time it runs at. That sentence is
   * what anybody reads when they open the file, and nothing kept it honest, so
   * moving a schedule in vercel.json left a confident and wrong claim behind
   * (L210). The two are compared here rather than trusted.
   */
  it.each(CRONS.map((c) => [c.name, c.crons[0]] as const))(
    "%s states its real time in its own docstring",
    (name, expression) => {
      const path = join("src", "app", "api", "cron", name, "route.ts");
      if (!existsSync(path)) return;

      const claimed = readFileSync(path, "utf8").match(
        /(\d{1,2}):(\d{2}) UTC/,
      );
      if (!claimed) return;

      const [minute, hour] = expression.trim().split(/\s+/);
      expect(
        `${Number(claimed[1])}:${claimed[2]}`,
        `${path} says it runs at ${claimed[0]}, vercel.json says ${expression}`,
      ).toBe(`${Number(hour)}:${minute.padStart(2, "0")}`);
    },
  );
});
