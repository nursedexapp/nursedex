import { describe, it, expect } from "vitest";
import { scheduledCrons, scheduledCronNames } from "./vercel-crons";

describe("scheduledCrons", () => {
  it("finds the crons this deployment actually schedules", () => {
    // A zero here would make the admin page and the heartbeat route agree that
    // nothing is scheduled, which is exactly what a moved or renamed config
    // would produce, and it would read as healthy.
    expect(scheduledCrons().length).toBeGreaterThan(0);
  });

  it("names each one by its last path segment, which is its heartbeat key", () => {
    for (const cron of scheduledCrons()) {
      expect(cron.name).not.toBe("");
      expect(cron.path.endsWith(`/${cron.name}`)).toBe(true);
    }
  });

  it("gives every cron at least one schedule to be judged against", () => {
    for (const cron of scheduledCrons()) {
      expect(cron.schedules.length).toBeGreaterThan(0);
      for (const schedule of cron.schedules) {
        expect(schedule.trim().split(/\s+/)).toHaveLength(5);
      }
    }
  });

  it("has no two crons sharing a heartbeat key", () => {
    const names = scheduledCronNames();
    expect(new Set(names).size).toBe(names.length);
  });
});
