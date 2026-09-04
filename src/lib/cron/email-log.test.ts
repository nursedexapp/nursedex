// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { shouldSendOnce, sendOnce } from "./email-log";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

/**
 * shouldSendOnce takes the Supabase client as an argument, so the client is the
 * only thing to mock.
 *
 * It used to SELECT email_log, decide in JavaScript, and insert only if it found
 * nothing, which is the #663 check-then-write race: two callers both read no row,
 * both insert, and the recipient gets the email twice. The INSERT is now the gate
 * (uniq_email_log_dedup, migration 062), so these tests are written against error
 * CODES coming back from the insert, not against a pre-read.
 */
const state = {
  insertError: null as { message: string; code?: string } | null,
};
const calls = { insert: [] as Record<string, unknown>[] };

function mockClient(): SupabaseClient {
  return {
    from: () =>
      createQueryBuilder({
        insert: (payload) => {
          calls.insert.push(payload as Record<string, unknown>);
          return { error: state.insertError };
        },
      }),
  } as unknown as SupabaseClient;
}

const ARGS = {
  recipientUserId: "user-1",
  emailType: "renewal_reminder",
  dedupKey: "sub-1",
};

beforeEach(() => {
  state.insertError = null;
  calls.insert = [];
  vi.restoreAllMocks();
});

describe("shouldSendOnce", () => {
  it("returns true and claims the dedup row on the first send", async () => {
    const result = await shouldSendOnce(mockClient(), ARGS);

    expect(result).toBe(true);
    expect(calls.insert).toEqual([
      {
        recipient_user_id: "user-1",
        email_type: "renewal_reminder",
        dedup_key: "sub-1",
      },
    ]);
  });

  it("returns false when a concurrent caller already claimed this email", async () => {
    // The loser of the race. Postgres rejects the duplicate with 23505, which is
    // the whole mechanism: it is not an error, it is the answer. Under the old
    // read-then-insert both callers sent.
    state.insertError = { message: "duplicate key value", code: "23505" };

    const result = await shouldSendOnce(mockClient(), ARGS);

    expect(result).toBe(false);
  });

  it("does not log a duplicate as an error, because it is not one", async () => {
    state.insertError = { message: "duplicate key value", code: "23505" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await shouldSendOnce(mockClient(), ARGS);

    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed (returns false) and logs when the log write genuinely breaks", async () => {
    // A real failure, not a duplicate: send nothing, but say so loudly.
    state.insertError = { message: "connection reset", code: "08006" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await shouldSendOnce(mockClient(), ARGS);

    expect(result).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});

/**
 * sendOnce exists because the claim and the release have to be one piece of
 * code (#415). Nine crons claimed a dedup row, sent, and never released the
 * claim when the send failed, so a transient Resend outage marked the person as
 * told forever: the email was lost and nothing would ever retry it. The not
 * listed nudge cron had the release written out by hand, correctly, and none of
 * its neighbours did, which is exactly the shape that gets copied wrong.
 */
const sendState = {
  insertError: null as { message: string; code?: string } | null,
  deleted: [] as { column: string; value: unknown }[],
  deleteCalled: 0,
};

function sendMockClient(): SupabaseClient {
  return {
    from: (table: string) =>
      createQueryBuilder({
        insert: () => ({ error: sendState.insertError }),
        delete: () => {
          if (table === "email_log") sendState.deleteCalled++;
          return "chain";
        },
        eq: (...args: unknown[]) => {
          sendState.deleted.push({ column: String(args[0]), value: args[1] });
          return "chain";
        },
        then: () => ({ error: null }),
      }),
  } as unknown as SupabaseClient;
}

describe("sendOnce", () => {
  beforeEach(() => {
    sendState.insertError = null;
    sendState.deleted = [];
    sendState.deleteCalled = 0;
    captureMessage.mockClear();
  });

  it("sends and reports it sent when the claim is fresh", async () => {
    const send = vi.fn(async () => true);

    const outcome = await sendOnce(sendMockClient(), ARGS, send);

    expect(outcome).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    expect(sendState.deleteCalled).toBe(0);
  });

  it("does not send at all when someone else already claimed this email", async () => {
    sendState.insertError = { message: "duplicate key value", code: "23505" };
    const send = vi.fn(async () => true);

    const outcome = await sendOnce(sendMockClient(), ARGS, send);

    expect(outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(sendState.deleteCalled).toBe(0);
  });

  /**
   * The failure this whole helper exists for. Left standing, the claim says the
   * person was told, so tomorrow's run skips them and the email is gone for
   * good. Releasing it risks sending twice if the send landed and only the
   * reply failed, which is much the better of the two mistakes.
   */
  it("releases the claim when the send does not land, so the next run retries", async () => {
    const send = vi.fn(async () => false);

    const outcome = await sendOnce(sendMockClient(), ARGS, send);

    expect(outcome).toBe("failed");
    expect(sendState.deleteCalled).toBe(1);
    expect(sendState.deleted).toEqual([
      { column: "recipient_user_id", value: "user-1" },
      { column: "email_type", value: "renewal_reminder" },
      { column: "dedup_key", value: "sub-1" },
    ]);
  });

  it("releases the claim when the send throws rather than returning false", async () => {
    const send = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendOnce(sendMockClient(), ARGS, send);

    expect(outcome).toBe("failed");
    expect(sendState.deleteCalled).toBe(1);
  });

  /**
   * A console line is not monitoring. Every one of these crons answers 200 on a
   * partial failure, so a swallowed send reaches nobody, every day, for as long
   * as it lasts.
   */
  it("reports a failed send to Sentry", async () => {
    const send = vi.fn(async () => false);

    await sendOnce(sendMockClient(), ARGS, send);

    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("renewal_reminder"),
      "warning",
    );
  });

  it("says nothing to Sentry when the send lands", async () => {
    const send = vi.fn(async () => true);

    await sendOnce(sendMockClient(), ARGS, send);

    expect(captureMessage).not.toHaveBeenCalled();
  });
});
