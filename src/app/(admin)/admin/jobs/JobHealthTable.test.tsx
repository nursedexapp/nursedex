// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobHealthTable } from "./JobHealthTable";
import type { JobHealth, JobHealthRow } from "@/lib/admin/job-health";

const DAY = 24 * 60 * 60 * 1000;

function row(overrides: Partial<JobHealthRow>): JobHealthRow {
  return {
    name: "review-invite",
    path: "/api/cron/review-invite",
    intervalMs: DAY,
    overdueAfterMs: DAY * 1.5,
    lastSuccessAt: "2026-09-03T11:00:00Z",
    ageMs: 60 * 60 * 1000,
    lastDurationMs: 1234,
    lastResult: { sent: 3 },
    status: "ok",
    ...overrides,
  };
}

function render(rows: JobHealthRow[]): string {
  const health: JobHealth = { rows, checkedAt: "2026-09-03T12:00:00Z" };
  return renderToStaticMarkup(<JobHealthTable health={health} />);
}

describe("the scheduled jobs table", () => {
  it("shows a job, when it last ran, how often it should, and what it reported", () => {
    const html = render([row({})]);

    expect(html).toContain("review-invite");
    expect(html).toContain("/api/cron/review-invite");
    expect(html).toContain("On schedule");
    expect(html).toContain("1.2s");
    expect(html).toContain("sent");
  });

  it("says a job has never run rather than showing a blank", () => {
    const html = render([
      row({ status: "never-ran", lastSuccessAt: null, ageMs: null, lastDurationMs: null, lastResult: null }),
    ]);

    expect(html).toContain("Not yet run");
    expect(html).toContain("Never");
    expect(html).toContain("Not recorded");
    expect(html).toContain("Nothing");
  });

  // Colour alone would leave the one thing this page exists to say unreadable
  // to a reader who cannot separate the greens from the ambers.
  it("names every status in words, not only in colour", () => {
    for (const status of ["ok", "overdue", "never-ran"] as const) {
      const html = render([row({ status })]);
      expect(html).toMatch(/On schedule|Overdue|Not yet run/);
    }
  });

  describe("the summary line", () => {
    it("says everything is on time when it is", () => {
      const html = render([row({}), row({ name: "hire-followup" })]);
      expect(html).toContain("All 2 scheduled jobs are running on time.");
    });

    // "13 jobs" alone reads the same whether all of them are healthy or all of
    // them have stopped.
    it("counts the overdue ones when there are any", () => {
      const html = render([row({}), row({ name: "hire-followup", status: "overdue" })]);
      expect(html).toContain("1 of 2 scheduled jobs is overdue.");
    });

    it("treats an empty list as a problem, not as an all clear", () => {
      const html = render([]);
      expect(html).toContain("No scheduled jobs found");
      expect(html).not.toMatch(/running on time/);
    });

    it("agrees with itself in the singular", () => {
      const html = render([row({})]);
      expect(html).toContain("All 1 scheduled job is running on time.");
    });
  });
});
