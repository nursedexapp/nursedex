// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

// #847. Both of these are rendered as a number on an admin screen, and both
// read their result as `count ?? 0`, so a failed count showed a real zero: an
// empty moderation queue, and a newsletter with no subscribers. Zero is the one
// wrong answer that looks entirely plausible, which is why the count helpers
// refuse it rather than passing it on.

const state: { count: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () =>
      createQueryBuilder({
        eq: () => ({ count: state.count, error: state.error }),
        is: () => ({ count: state.count, error: state.error }),
      }),
  }),
}));

import { getPendingCommentCount } from "@/lib/comments/queries";
import { getConfirmedSubscriberCount } from "@/lib/newsletter/queries";

beforeEach(() => {
  state.count = 0;
  state.error = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getPendingCommentCount", () => {
  it("returns the count", async () => {
    state.count = 4;
    await expect(getPendingCommentCount()).resolves.toBe(4);
  });

  it("returns a real zero, which is an empty moderation queue", async () => {
    state.count = 0;
    await expect(getPendingCommentCount()).resolves.toBe(0);
  });

  it("refuses a failed count rather than showing an empty queue", async () => {
    state.count = null;
    state.error = { message: "connection reset" };
    await expect(getPendingCommentCount()).rejects.toThrow(
      /could not be read: connection reset/,
    );
  });
});

describe("getConfirmedSubscriberCount", () => {
  it("returns the count", async () => {
    state.count = 812;
    await expect(getConfirmedSubscriberCount()).resolves.toBe(812);
  });

  it("refuses a failed count rather than showing no subscribers", async () => {
    state.count = null;
    state.error = { message: "connection reset" };
    await expect(getConfirmedSubscriberCount()).rejects.toThrow(
      /could not be read: connection reset/,
    );
  });

  it("refuses a null count with no error, because the query asked for none", async () => {
    // A count option dropped from the query is silent otherwise, and the
    // number it produces is zero.
    state.count = null;
    state.error = null;
    await expect(getConfirmedSubscriberCount()).rejects.toThrow(
      /did not ask for one/,
    );
  });
});
