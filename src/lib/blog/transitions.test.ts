// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BlogPostStatus } from "@/types/enums";
import { toDraft, toPublished, toArchived, toScheduled } from "./transitions";

const NOW = new Date("2026-06-07T12:00:00.000Z");

describe("blog status transitions", () => {
  it("toDraft clears the publish time", () => {
    expect(toDraft()).toEqual({
      status: BlogPostStatus.DRAFT,
      publish_at: null,
    });
  });

  it("toPublished stamps publish_at with now", () => {
    expect(toPublished(NOW)).toEqual({
      status: BlogPostStatus.PUBLISHED,
      publish_at: NOW.toISOString(),
    });
  });

  it("toArchived clears the publish time", () => {
    expect(toArchived()).toEqual({
      status: BlogPostStatus.ARCHIVED,
      publish_at: null,
    });
  });

  it("toScheduled accepts a future time", () => {
    const future = "2026-06-08T12:00:00.000Z";
    const result = toScheduled(future, NOW);
    expect(result).toEqual({
      ok: true,
      patch: { status: BlogPostStatus.SCHEDULED, publish_at: future },
    });
  });

  it("toScheduled rejects a past or present time", () => {
    expect(toScheduled("2026-06-06T12:00:00.000Z", NOW).ok).toBe(false);
    expect(toScheduled(NOW.toISOString(), NOW).ok).toBe(false);
  });

  it("toScheduled rejects a missing or unparseable time", () => {
    expect(toScheduled(null, NOW).ok).toBe(false);
    expect(toScheduled("not a date", NOW).ok).toBe(false);
  });
});
