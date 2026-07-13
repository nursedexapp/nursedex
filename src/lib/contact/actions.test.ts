// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

/**
 * #708. submitContact was a bare insert into contact_submissions, a table with
 * no uniqueness beyond its primary key, followed by an email to the support
 * inbox. A double-click wrote two rows and sent two notifications, and nothing
 * in the database could tell the second write apart from a genuine second
 * message, because as far as it knew it WAS one.
 *
 * The form now mints the row's id, so a repeat carries the same id and collides.
 * The tests that matter are the duplicate's: it must write no second row and,
 * above all, send no second email.
 */
const h = vi.hoisted(() => ({
  insertError: null as { message: string; code?: string } | null,
  turnstileOk: true,
  calls: {
    inserts: [] as Record<string, unknown>[],
    emails: [] as unknown[],
  },
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "1.2.3.4" }),
}));
vi.mock("@/lib/turnstile/verify", () => ({
  verifyTurnstileToken: async () => h.turnstileOk,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () =>
      createQueryBuilder({
        insert: (payload) => {
          h.calls.inserts.push(payload as Record<string, unknown>);
          return { error: h.insertError };
        },
      }),
  }),
}));
vi.mock("@/lib/email/send", () => ({
  sendContactReceivedEmail: (...a: unknown[]) => {
    h.calls.emails.push(a);
    return Promise.resolve();
  },
}));

import { submitContact } from "./actions";

const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";
const INPUT = {
  name: "Reader",
  email: "reader@example.com",
  subject: "Hello",
  message: "I have a question about the platform.",
  turnstile_token: "tok",
  submission_id: SUBMISSION_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.insertError = null;
  h.turnstileOk = true;
  h.calls.inserts.length = 0;
  h.calls.emails.length = 0;
});

describe("submitContact", () => {
  it("writes the message under the id the form minted, and notifies support", async () => {
    const res = await submitContact(INPUT);

    expect(res.success).toBe(true);
    expect(h.calls.inserts[0]).toMatchObject({
      id: SUBMISSION_ID,
      subject: "Hello",
    });
    expect(h.calls.emails).toHaveLength(1);
  });

  it("sends NO second email when the same submission arrives twice", async () => {
    // The duplicate. Postgres rejects the repeated id with 23505, which is not a
    // failure here, it is the answer: this message is already in the inbox.
    h.insertError = { message: "duplicate key value", code: "23505" };

    const res = await submitContact(INPUT);

    // Reported as success on purpose: from the sender's point of view the
    // message did go through. Showing an error would invite a THIRD attempt.
    expect(res.success).toBe(true);
    expect(h.calls.emails).toHaveLength(0);
  });

  it("still reports a genuine database failure instead of a fake success", async () => {
    h.insertError = { message: "connection reset", code: "08006" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await submitContact(INPUT);

    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.calls.emails).toHaveLength(0);
  });

  it("refuses a submission with no id rather than inventing one", async () => {
    // Falling back to a database-generated id would quietly restore the bug.
    const { submission_id: _omitted, ...withoutId } = INPUT;

    const res = await submitContact(withoutId);

    expect(res.success).toBe(false);
    expect(h.calls.inserts).toHaveLength(0);
  });

  it("writes nothing when the CAPTCHA fails", async () => {
    h.turnstileOk = false;

    const res = await submitContact(INPUT);

    expect(res).toEqual({ success: false, error: "captcha_failed" });
    expect(h.calls.inserts).toHaveLength(0);
  });
});
