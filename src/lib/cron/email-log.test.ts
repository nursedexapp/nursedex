// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { shouldSendOnce } from "./email-log";

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
