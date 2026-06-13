import { describe, it, expect } from "vitest";
import {
  formatTimeAgo,
  subscriptionPipelineLabel,
} from "@/lib/admin/subscription-health";

const NOW = new Date("2026-06-13T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTimeAgo", () => {
  it("reads under a minute as 'just now'", () => {
    expect(formatTimeAgo(ago(0), NOW)).toBe("just now");
    expect(formatTimeAgo(ago(59 * SEC), NOW)).toBe("just now");
  });

  it("scales through minutes, hours, and days", () => {
    expect(formatTimeAgo(ago(5 * MIN), NOW)).toBe("5m ago");
    expect(formatTimeAgo(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(formatTimeAgo(ago(2 * DAY), NOW)).toBe("2d ago");
    expect(formatTimeAgo(ago(45 * DAY), NOW)).toBe("1mo ago");
    expect(formatTimeAgo(ago(400 * DAY), NOW)).toBe("1y ago");
  });

  it("treats a future timestamp as 'just now' rather than negative", () => {
    expect(formatTimeAgo(ago(-HOUR), NOW)).toBe("just now");
  });

  it("returns 'unknown' for an unparseable timestamp", () => {
    expect(formatTimeAgo("not-a-date", NOW)).toBe("unknown");
  });
});

describe("subscriptionPipelineLabel", () => {
  it("flags an untouched pipeline when no rows exist", () => {
    expect(subscriptionPipelineLabel(null, NOW)).toBe("No webhook events yet");
  });

  it("reports how recently the webhook last wrote", () => {
    expect(subscriptionPipelineLabel(ago(3 * HOUR), NOW)).toBe(
      "Last webhook write 3h ago",
    );
  });
});
