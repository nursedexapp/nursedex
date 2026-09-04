// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

import {
  ROW_NOT_FOUND,
  assertNoWriteError,
  unwrapOrThrow,
  toTypedFailure,
  DB_FAILURE_MESSAGE,
} from "./results";

/** A PostgREST result, as Supabase hands it back. */
function ok<T>(data: T) {
  return { data, error: null };
}
function failed(message: string, code?: string) {
  return { data: null, error: { message, code: code ?? "08006" } };
}

beforeEach(() => {
  vi.restoreAllMocks();
  h.captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("assertNoWriteError", () => {
  it("returns quietly when the write succeeded", async () => {
    await expect(
      assertNoWriteError(ok(null), "the blocked_emails upsert"),
    ).resolves.toBeUndefined();
  });

  it("throws naming the operation and the database message", async () => {
    await expect(
      assertNoWriteError(failed("permission denied"), "the blocked_emails upsert"),
    ).rejects.toThrow(
      "the blocked_emails upsert could not be written: permission denied",
    );
  });

  it("accepts the un-awaited query so a Promise.all element can be wrapped", async () => {
    await expect(
      assertNoWriteError(Promise.resolve(failed("boom")), "the audit row"),
    ).rejects.toThrow("the audit row could not be written: boom");
  });

  it("throws on a zero-row write, because a write that matched nothing did not happen", async () => {
    await expect(
      assertNoWriteError(
        failed("no rows returned", ROW_NOT_FOUND),
        "the status update",
      ),
    ).rejects.toThrow("the status update could not be written");
  });

  it("leaves the report to the global handler rather than capturing twice", async () => {
    await expect(
      assertNoWriteError(failed("boom"), "the audit row"),
    ).rejects.toThrow();
    expect(h.captureException).not.toHaveBeenCalled();
  });
});

describe("unwrapOrThrow", () => {
  it("returns the rows when the read succeeded", async () => {
    await expect(unwrapOrThrow(ok([{ id: "a" }]), "the nurse list")).resolves.toEqual(
      [{ id: "a" }],
    );
  });

  it("throws naming the operation and the database message", async () => {
    await expect(
      unwrapOrThrow(failed("connection reset"), "the nurse profile"),
    ).rejects.toThrow("the nurse profile could not be read: connection reset");
  });

  it("returns null for the absent row rather than throwing", async () => {
    // .single() reports zero matching rows as PGRST116. That is an answer, not
    // a failure, and throwing would put an error screen in front of a visitor
    // who asked for something that simply does not exist.
    await expect(
      unwrapOrThrow(failed("no rows returned", ROW_NOT_FOUND), "the nurse profile"),
    ).resolves.toBeNull();
  });

  it("does not report the absent row anywhere", async () => {
    await unwrapOrThrow(
      failed("no rows returned", ROW_NOT_FOUND),
      "the nurse profile",
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("logs the failure server side, because production shows the visitor a digest", async () => {
    await expect(
      unwrapOrThrow(failed("connection reset"), "the nurse profile"),
    ).rejects.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      "the nurse profile could not be read: connection reset",
    );
  });

  it("accepts the un-awaited query so a Promise.all element can be wrapped", async () => {
    await expect(
      unwrapOrThrow(Promise.resolve(ok([1, 2])), "the counts"),
    ).resolves.toEqual([1, 2]);
  });
});

describe("toTypedFailure", () => {
  it("carries the data through when the read succeeded", async () => {
    await expect(toTypedFailure(ok({ id: "a" }), "load your subscription")).resolves.toEqual(
      { ok: true, data: { id: "a" } },
    );
  });

  it("returns a failure a control can render, without the database message", async () => {
    const outcome = await toTypedFailure(
      failed("permission denied for table subscriptions"),
      "load your subscription",
    );
    expect(outcome).toEqual({ ok: false, error: DB_FAILURE_MESSAGE });
    expect(JSON.stringify(outcome)).not.toContain("subscriptions");
  });

  it("uses a caller supplied sentence when one is given", async () => {
    const outcome = await toTypedFailure(
      failed("boom"),
      "load your subscription",
      "We couldn't check your subscription. Please try again.",
    );
    expect(outcome).toEqual({
      ok: false,
      error: "We couldn't check your subscription. Please try again.",
    });
  });

  it("reports to Sentry, because nothing throws here for the global handler to see", async () => {
    await toTypedFailure(failed("boom"), "load your subscription");
    expect(h.captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = h.captureException.mock.calls[0];
    expect((err as Error).message).toBe("load your subscription failed: boom");
    expect(ctx).toEqual({ tags: { db_operation: "load your subscription" } });
  });

  it("treats the absent row as a success carrying null", async () => {
    await expect(
      toTypedFailure(failed("no rows returned", ROW_NOT_FOUND), "load your profile"),
    ).resolves.toEqual({ ok: true, data: null });
    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("accepts the un-awaited query so a Promise.all element can be wrapped", async () => {
    await expect(
      toTypedFailure(Promise.resolve(ok("x")), "load it"),
    ).resolves.toEqual({ ok: true, data: "x" });
  });
});

describe("toTypedFailure on a write, which is what a \"use server\" module has", () => {
  it("carries a successful write through", async () => {
    await expect(
      toTypedFailure(ok(null), "add the address to the block list"),
    ).resolves.toEqual({ ok: true, data: null });
  });

  it("names the operation without claiming it was a read", async () => {
    await toTypedFailure(
      failed("permission denied"),
      "add the address to the block list",
    );
    const [err] = h.captureException.mock.calls[0];
    expect((err as Error).message).toBe(
      "add the address to the block list failed: permission denied",
    );
  });
});
