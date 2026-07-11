// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryBuilder } from "../../../test/supabase-mock";
import { shouldSendOnce } from "./email-log";

// shouldSendOnce takes the Supabase client as an argument, so the client is
// the only thing to mock. It read-then-inserts against email_log with no
// unique constraint, and deliberately fails closed (returns false) on an
// insert error so a broken log never causes duplicate sends.
const state = {
  existing: null as { id: string } | null,
  insertError: null as { message: string } | null,
};
const calls = { insert: [] as Record<string, unknown>[] };

function mockClient(): SupabaseClient {
  return {
    from: () =>
      createQueryBuilder({
        maybeSingle: () => ({ data: state.existing }),
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
  state.existing = null;
  state.insertError = null;
  calls.insert = [];
  vi.restoreAllMocks();
});

describe("shouldSendOnce", () => {
  it("returns false and does not insert when a matching log row already exists", async () => {
    state.existing = { id: "log-1" };
    const result = await shouldSendOnce(mockClient(), ARGS);
    expect(result).toBe(false);
    expect(calls.insert).toHaveLength(0);
  });

  it("returns true and inserts the dedup row on the first send", async () => {
    state.existing = null;
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

  it("fails closed (returns false) when the log insert errors", async () => {
    state.existing = null;
    state.insertError = { message: "log write failed" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await shouldSendOnce(mockClient(), ARGS);
    expect(result).toBe(false);
    expect(calls.insert).toHaveLength(1);
  });
});
