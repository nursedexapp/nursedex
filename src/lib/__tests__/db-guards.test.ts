import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";
import { RATE_LIMITS } from "@/lib/constants";

import {
  unwrapOrThrow,
  assertNoWriteError,
  unwrapCountOrThrow,
} from "@/lib/db/results";
// Behavioural guards for the two correctness rules that now live inside the
// database rather than in application code:
//
//   consume_reveal_rate_limit  (migration 054, issue #563)
//   apply_subscription_event   (migration 055, issue #528)
//
// Their existing unit tests only assert the *text* of the migration files.
// Nothing executed the predicates that actually do the work: the
// `WHERE reveal_count < v_hard_cap` that refuses a 26th reveal, and the
// `WHERE last_event_at <= EXCLUDED.last_event_at` that refuses an out-of-order
// Stripe event. Those branches are why the migrations exist, so they are
// executed here against a real Postgres (issue #575).
//
// The concurrency cases are the point. A read-modify-write increment passes
// every sequential test and still loses updates under simultaneous callers,
// which is exactly how #563 shipped. Only firing real concurrent statements
// at a real database can catch that.

const {
  url: SUPABASE_URL,
  anonKey: ANON_KEY,
  serviceKey: SERVICE_KEY,
} = getLiveSupabaseEnv();

// These tests force counters to their cap and replay payment events. They must
// never point at production; .env.local holds production credentials.
assertLocalSupabaseUrl(SUPABASE_URL, "Database guard tests");

// Imported, not redeclared: these tests are what bind constants.ts to the
// numbers the database actually enforces (issue #576). Editing a constant
// without a matching migration fails here instead of silently doing nothing.
const { REVEALS_HARD_CAP, REVEALS_CAPTCHA_THRESHOLD } = RATE_LIMITS;

let service: SupabaseClient;
const stamp = Date.now();
const createdUserIds: string[] = [];

async function createFamily(prefix: string): Promise<string> {
  const { id } = await createLiveTestUser({
    service,
    url: SUPABASE_URL!,
    anonKey: ANON_KEY!,
    role: "family",
    emailPrefix: `db-guards-${prefix}`,
    stamp,
  });
  createdUserIds.push(id);
  return id;
}

/** Today's UTC date, matching the DB's CURRENT_DATE under a UTC server. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function setRevealCount(familyId: string, count: number): Promise<void> {
  const { error } = await service.from("rate_limit_reveals").upsert(
    {
      family_user_id: familyId,
      date: today(),
      reveal_count: count,
      captcha_triggered: false,
      consecutive_captcha_days: 0,
    },
    { onConflict: "family_user_id,date" },
  );
  if (error) throw error;
}

async function readRevealCount(familyId: string): Promise<number | null> {
  const data = await unwrapOrThrow(
    service
      .from("rate_limit_reveals")
      .select("reveal_count")
      .eq("family_user_id", familyId)
      .eq("date", today())
      .maybeSingle(),
    "rate_limit_reveals, a fixture read in db-guards",
  );
  return data ? data.reveal_count : null;
}

interface ConsumeRow {
  allowed: boolean;
  current_count: number;
  needs_captcha: boolean;
}

async function consume(familyId: string, captcha = false): Promise<ConsumeRow> {
  const { data, error } = await service
    .rpc("consume_reveal_rate_limit", {
      p_family_user_id: familyId,
      p_triggered_captcha: captcha,
    })
    .single();
  if (error) throw error;
  return data as ConsumeRow;
}

beforeAll(() => {
  expect(SUPABASE_URL).toBeTruthy();
  expect(SERVICE_KEY).toBeTruthy();
  service = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("consume_reveal_rate_limit (migration 054, issue #563)", () => {
  let family: string;

  beforeAll(async () => {
    family = await createFamily("reveals");
  });

  beforeEach(async () => {
    await assertNoWriteError(
      service
        .from("rate_limit_reveals")
        .delete()
        .eq("family_user_id", family)
        .eq("date", today()),
      "rate_limit_reveals, a fixture write in db-guards",
    );
  });

  it("creates the day's row and counts the first reveal", async () => {
    const res = await consume(family);
    expect(res.allowed).toBe(true);
    expect(res.current_count).toBe(1);
  });

  it("increments an existing row", async () => {
    await setRevealCount(family, 3);
    const res = await consume(family);
    expect(res.allowed).toBe(true);
    expect(res.current_count).toBe(4);
  });

  it("allows the reveal that lands exactly on the cap", async () => {
    await setRevealCount(family, REVEALS_HARD_CAP - 1);
    const res = await consume(family);
    expect(res.allowed).toBe(true);
    expect(res.current_count).toBe(REVEALS_HARD_CAP);
  });

  it("refuses the reveal past the cap and does not increment the counter", async () => {
    await setRevealCount(family, REVEALS_HARD_CAP);
    const res = await consume(family);
    expect(res.allowed).toBe(false);
    expect(res.current_count).toBe(REVEALS_HARD_CAP);
    // The refusal must not have bumped the stored counter.
    expect(await readRevealCount(family)).toBe(REVEALS_HARD_CAP);
  });

  it("flags captcha once the threshold is reached", async () => {
    await setRevealCount(family, REVEALS_CAPTCHA_THRESHOLD - 1);
    const res = await consume(family);
    expect(res.current_count).toBe(REVEALS_CAPTCHA_THRESHOLD);
    expect(res.needs_captcha).toBe(true);
  });

  it("does not flag captcha one reveal below the threshold", async () => {
    // The pair of boundary assertions is what pins the database's threshold to
    // RATE_LIMITS.REVEALS_CAPTCHA_THRESHOLD. Asserting only "flags at the
    // threshold" would still pass if the constant were raised without a
    // matching migration (#576).
    await setRevealCount(family, REVEALS_CAPTCHA_THRESHOLD - 2);
    const res = await consume(family);
    expect(res.current_count).toBe(REVEALS_CAPTCHA_THRESHOLD - 1);
    expect(res.needs_captcha).toBe(false);
  });

  it("loses no increment when many reveals are consumed concurrently", async () => {
    // The bug in #563: read count, add one in JS, write it back. Concurrent
    // callers all read the same value and all write the same value + 1, so the
    // counter undercounts and the cap can be exceeded. An atomic increment
    // must land on exactly N.
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () => consume(family)),
    );

    expect(results.every((r) => r.allowed)).toBe(true);
    expect(await readRevealCount(family)).toBe(N);
    // Every caller saw a distinct count; none observed a lost update.
    const counts = results.map((r) => r.current_count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("lets exactly one caller take the last slot under a concurrent burst", async () => {
    // The heart of the fix: a family sitting one below the cap, hit by a burst
    // of simultaneous reveals, must end at the cap with exactly one winner.
    await setRevealCount(family, REVEALS_HARD_CAP - 1);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consume(family)),
    );

    const allowed = results.filter((r) => r.allowed);
    expect(allowed).toHaveLength(1);
    expect(await readRevealCount(family)).toBe(REVEALS_HARD_CAP);
    expect(results.filter((r) => !r.allowed)).toHaveLength(9);
  });

  it("never exceeds the cap when the whole day is consumed concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: REVEALS_HARD_CAP + 15 }, () => consume(family)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(REVEALS_HARD_CAP);
    expect(await readRevealCount(family)).toBe(REVEALS_HARD_CAP);
  });

  it("starts the consecutive-captcha streak at 1 when yesterday had no trigger", async () => {
    const res = await consume(family, true);
    expect(res.allowed).toBe(true);
    const data = await unwrapOrThrow(
      service
        .from("rate_limit_reveals")
        .select("captcha_triggered, consecutive_captcha_days")
        .eq("family_user_id", family)
        .eq("date", today())
        .single(),
      "rate_limit_reveals, a fixture read in db-guards",
    );
    expect(data!.captcha_triggered).toBe(true);
    expect(data!.consecutive_captcha_days).toBe(1);
  });

  it("carries the consecutive-captcha streak forward from yesterday", async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const { error } = await service.from("rate_limit_reveals").upsert(
      {
        family_user_id: family,
        date: yesterday.toISOString().slice(0, 10),
        reveal_count: 12,
        captcha_triggered: true,
        consecutive_captcha_days: 2,
      },
      { onConflict: "family_user_id,date" },
    );
    if (error) throw error;

    await consume(family, true);

    const data = await unwrapOrThrow(
      service
        .from("rate_limit_reveals")
        .select("consecutive_captcha_days")
        .eq("family_user_id", family)
        .eq("date", today())
        .single(),
      "rate_limit_reveals, a fixture read in db-guards",
    );
    expect(data!.consecutive_captcha_days).toBe(3);

    await assertNoWriteError(
      service
        .from("rate_limit_reveals")
        .delete()
        .eq("family_user_id", family)
        .eq("date", yesterday.toISOString().slice(0, 10)),
      "rate_limit_reveals, a fixture write in db-guards",
    );
  });

  it("does not re-bump the streak on a second captcha reveal the same day", async () => {
    // The ON CONFLICT DO UPDATE path increments reveal_count but deliberately
    // leaves consecutive_captcha_days alone, so a single day counts once toward
    // the streak no matter how many captcha reveals happen within it.
    await assertNoWriteError(
      service.from("rate_limit_reveals").upsert(
        {
          family_user_id: family,
          date: today(),
          reveal_count: 5,
          captcha_triggered: true,
          consecutive_captcha_days: 2,
        },
        { onConflict: "family_user_id,date" },
      ),
      "rate_limit_reveals, a fixture write in db-guards",
    );

    const res = await consume(family, true);
    expect(res.current_count).toBe(6);

    const data = await unwrapOrThrow(
      service
        .from("rate_limit_reveals")
        .select("consecutive_captcha_days")
        .eq("family_user_id", family)
        .eq("date", today())
        .single(),
      "rate_limit_reveals, a fixture read in db-guards",
    );
    // Still 2, not re-bumped to 3, even though this reveal also triggered captcha.
    expect(data!.consecutive_captcha_days).toBe(2);
  });

  it("resets the streak to 1 when yesterday existed but did not trigger captcha", async () => {
    // A gap day (reveals happened, but never enough to trip captcha) breaks the
    // streak: the carry-forward only adds to yesterday's streak when yesterday
    // itself triggered captcha, so today starts fresh at 1.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yDate = yesterday.toISOString().slice(0, 10);
    const { error } = await service.from("rate_limit_reveals").upsert(
      {
        family_user_id: family,
        date: yDate,
        reveal_count: 4,
        captcha_triggered: false,
        consecutive_captcha_days: 5,
      },
      { onConflict: "family_user_id,date" },
    );
    if (error) throw error;

    await consume(family, true);

    const data = await unwrapOrThrow(
      service
        .from("rate_limit_reveals")
        .select("consecutive_captcha_days")
        .eq("family_user_id", family)
        .eq("date", today())
        .single(),
      "rate_limit_reveals, a fixture read in db-guards",
    );
    expect(data!.consecutive_captcha_days).toBe(1);

    await assertNoWriteError(
      service
        .from("rate_limit_reveals")
        .delete()
        .eq("family_user_id", family)
        .eq("date", yDate),
      "rate_limit_reveals, a fixture write in db-guards",
    );
  });
});

describe("apply_subscription_event (migration 055, issue #528)", () => {
  let family: string;
  let subId: string;
  let counter = 0;

  const T1 = new Date(1_700_000_000 * 1000).toISOString(); // oldest
  const T2 = new Date(1_700_000_500 * 1000).toISOString(); // middle
  const T3 = new Date(1_700_001_000 * 1000).toISOString(); // newest

  beforeAll(async () => {
    family = await createFamily("subs");
  });

  beforeEach(async () => {
    // A fresh subscription id per test: stripe_subscription_id is UNIQUE, and
    // status 'cancelled' stays outside uniq_subscriptions_active_per_plan.
    subId = `sub_guard_${stamp}_${counter++}`;
  });

  async function applyEvent(
    lastEventAt: string,
    status = "cancelled",
  ): Promise<boolean> {
    const { data, error } = await service.rpc("apply_subscription_event", {
      p_user_id: family,
      p_stripe_customer_id: "cus_guard",
      p_stripe_subscription_id: subId,
      p_plan_type: "family_access",
      p_status: status,
      p_billing_interval: "month",
      p_current_period_start: T1,
      p_current_period_end: T3,
      p_cancel_at_period_end: false,
      p_last_event_at: lastEventAt,
    });
    if (error) throw error;
    return data as boolean;
  }

  async function readLastEventAt(): Promise<string | null> {
    const data = await unwrapOrThrow(
      service
        .from("subscriptions")
        .select("last_event_at")
        .eq("stripe_subscription_id", subId)
        .maybeSingle(),
      "subscriptions, a fixture read in db-guards",
    );
    return data ? data.last_event_at : null;
  }

  afterAll(async () => {
    await assertNoWriteError(
      service
        .from("subscriptions")
        .delete()
        .like("stripe_subscription_id", `sub_guard_${stamp}_%`),
      "subscriptions, a fixture write in db-guards",
    );
  });

  it("inserts the row on the first event", async () => {
    expect(await applyEvent(T2)).toBe(true);
    expect(await readLastEventAt()).not.toBeNull();
  });

  it("applies an event newer than the one already stored", async () => {
    await applyEvent(T2);
    expect(await applyEvent(T3)).toBe(true);
  });

  it("refuses a strictly older event and leaves the stored state untouched", async () => {
    await applyEvent(T2);
    const before = await readLastEventAt();

    expect(await applyEvent(T1)).toBe(false);
    // The whole point of #414/#528: an out-of-order event must not revert state.
    expect(await readLastEventAt()).toBe(before);
  });

  it("still applies an event whose timestamp exactly matches the stored one", async () => {
    // Stripe's `created` is unix seconds and is not unique across distinct
    // events, so a tie must apply. A strict `<` here would silently drop a
    // legitimate second event from the same second (#528).
    await applyEvent(T2);
    expect(await applyEvent(T2)).toBe(true);
  });

  it("does not revert a cancellation when a stale update arrives afterwards", async () => {
    // The concrete harm: an older customer.subscription.updated delivered after
    // a newer delete would un-cancel the subscription.
    expect(await applyEvent(T3, "cancelled")).toBe(true);
    expect(await applyEvent(T2, "active")).toBe(false);

    const data = await unwrapOrThrow(
      service
        .from("subscriptions")
        .select("status")
        .eq("stripe_subscription_id", subId)
        .single(),
      "subscriptions, a fixture read in db-guards",
    );
    expect(data!.status).toBe("cancelled");
  });

  it("keeps the newest event when events arrive concurrently", async () => {
    // Under the old read-then-compare guard, simultaneous events could both
    // pass the "am I newer" check and the older one could land last.
    const results = await Promise.all([
      applyEvent(T1),
      applyEvent(T2),
      applyEvent(T3),
    ]);

    // Whatever order they serialized in, the newest must win. Compare instants,
    // not strings: Postgres renders timestamptz as "+00:00", not "Z".
    expect(results.some((r) => r)).toBe(true);
    const stored = await readLastEventAt();
    expect(new Date(stored!).getTime()).toBe(new Date(T3).getTime());
  });
});

// reveal_nurse (migration 059, issue #691)
//
// The bug: revealNurse spent a slot from the family's capped daily allowance
// BEFORE it wrote the reveal row. Spending first is deliberate, it is what stops
// a burst slipping past the cap, but it means two attempts that overlap between
// the spend and the write each pay, and the family ends up with ONE reveal and
// TWO slots gone from a capped allowance. That is the exact harm #653 exists to
// prevent, and it needs no retry button: two concurrent requests are enough.
//
// The fix folds the check, the spend and the write into one function, so a
// repeat spends nothing. These cases are the reason it exists, so they run
// against a real Postgres. The concurrency one is the whole point: the sequential
// version of this bug is easy to miss and impossible to fix by reading.
describe("reveal_nurse (migration 059, issue #691)", () => {
  let family: string;
  let nurse: string;
  let otherNurse: string;

  interface RevealRow {
    allowed: boolean;
    current_count: number;
    needs_captcha: boolean;
    already_revealed: boolean;
  }

  async function reveal(
    familyId: string,
    nurseId: string,
    captcha = false,
  ): Promise<RevealRow> {
    const { data, error } = await service
      .rpc("reveal_nurse", {
        p_family_user_id: familyId,
        p_nurse_user_id: nurseId,
        p_triggered_captcha: captcha,
      })
      .single();
    if (error) throw error;
    return data as RevealRow;
  }

  async function createNurse(prefix: string): Promise<string> {
    const { id } = await createLiveTestUser({
      service,
      url: SUPABASE_URL!,
      anonKey: ANON_KEY!,
      role: "nurse",
      emailPrefix: `db-guards-${prefix}`,
      stamp,
    });
    createdUserIds.push(id);
    return id;
  }

  beforeAll(async () => {
    family = await createFamily("reveal-atomic");
    nurse = await createNurse("reveal-atomic-n1");
    otherNurse = await createNurse("reveal-atomic-n2");
  });

  beforeEach(async () => {
    await assertNoWriteError(
      service
        .from("rate_limit_reveals")
        .delete()
        .eq("family_user_id", family)
        .eq("date", today()),
      "rate_limit_reveals, a fixture write in db-guards",
    );
    await assertNoWriteError(
      service.from("reveals").delete().eq("family_user_id", family),
      "reveals, a fixture write in db-guards",
    );
  });

  it("spends one slot for a first reveal", async () => {
    const res = await reveal(family, nurse);

    expect(res.allowed).toBe(true);
    expect(res.already_revealed).toBe(false);
    expect(await readRevealCount(family)).toBe(1);
  });

  it("spends NOTHING when the same nurse is revealed again", async () => {
    // This is the retry: the family already has this nurse. Charging them a
    // second slot from a capped daily allowance for a reveal they already own is
    // the bug.
    await reveal(family, nurse);
    const again = await reveal(family, nurse);

    expect(again.allowed).toBe(true);
    expect(again.already_revealed).toBe(true);
    expect(await readRevealCount(family)).toBe(1);
  });

  it("spends exactly one slot when two reveals of the same nurse race", async () => {
    // The case that cannot be caught sequentially. Both callers look, both see
    // no reveal, and both go on to spend. Only the atomic version gives the
    // loser's slot back.
    const [a, b] = await Promise.all([
      reveal(family, nurse),
      reveal(family, nurse),
    ]);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    // One of them found the row already there and handed its slot back.
    expect(
      [a.already_revealed, b.already_revealed].filter(Boolean),
    ).toHaveLength(1);
    expect(await readRevealCount(family)).toBe(1);

    const count = await unwrapCountOrThrow(
      service
        .from("reveals")
        .select("id", { count: "exact", head: true })
        .eq("family_user_id", family)
        .eq("nurse_user_id", nurse),
      "reveals, a fixture count in db-guards",
    );
    expect(count).toBe(1);
  });

  it("still refuses a NEW nurse once the family is at the cap", async () => {
    // The cap is the reason the spend came first. Making the reveal idempotent
    // must not reopen the hole it was protecting.
    await setRevealCount(family, REVEALS_HARD_CAP);

    const res = await reveal(family, otherNurse);

    expect(res.allowed).toBe(false);
    expect(await readRevealCount(family)).toBe(REVEALS_HARD_CAP);
  });

  it("still hands back a nurse the family already revealed, even at the cap", async () => {
    // A family at their daily cap has not lost access to the contacts they
    // already paid for. Refusing here would take away what they already own.
    await reveal(family, nurse);
    await setRevealCount(family, REVEALS_HARD_CAP);

    const res = await reveal(family, nurse);

    expect(res.allowed).toBe(true);
    expect(res.already_revealed).toBe(true);
    expect(await readRevealCount(family)).toBe(REVEALS_HARD_CAP);
  });
});

// ── #663 ──────────────────────────────────────────────────────────────────────
//
// The same check-then-write race as #651/#652/#653, swept across the rest of the
// app. Two of the fixes moved the decision into the database, so like the two
// above they are only really tested by firing concurrent statements at a real
// Postgres. A sequential test passes on the broken code.

describe("uniq_email_log_dedup (migration 062, issue #663)", () => {
  let recipient: string;

  beforeAll(async () => {
    recipient = await createFamily("emaillog");
  });

  const row = (dedupKey: string) => ({
    recipient_user_id: recipient,
    email_type: "renewal_reminder",
    dedup_key: dedupKey,
  });

  it("refuses a second log row for the same recipient, type and dedup key", async () => {
    const key = `sub-${stamp}-seq`;

    const first = await service.from("email_log").insert(row(key));
    const second = await service.from("email_log").insert(row(key));

    expect(first.error).toBeNull();
    // 23505 is not a failure, it is the mechanism: shouldSendOnce reads this
    // code as "someone else already claimed this email" and sends nothing.
    expect(second.error?.code).toBe("23505");
  });

  it("lets exactly one of two SIMULTANEOUS claims through", async () => {
    // The case that matters. shouldSendOnce used to SELECT, find nothing, and
    // insert, so two callers arriving together both sent. Without the unique
    // index this assertion passes with BOTH inserts succeeding.
    const key = `sub-${stamp}-concurrent`;

    const results = await Promise.all([
      service.from("email_log").insert(row(key)),
      service.from("email_log").insert(row(key)),
    ]);

    const won = results.filter((r) => !r.error);
    expect(won).toHaveLength(1);

    const data = await unwrapOrThrow(
      service
        .from("email_log")
        .select("id")
        .eq("recipient_user_id", recipient)
        .eq("dedup_key", key),
      "email_log, a fixture read in db-guards",
    );
    expect(data).toHaveLength(1);
  });

  it("still allows a different dedup key for the same recipient and type", async () => {
    // The index must not turn "send once per subscription period" into "send
    // once, ever": a renewal reminder is legitimate again next period.
    const a = await service.from("email_log").insert(row(`sub-${stamp}-a`));
    const b = await service.from("email_log").insert(row(`sub-${stamp}-b`));

    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });
});

describe("complete_consulting_request (migration 062, issue #663)", () => {
  async function newRequest(suffix: string): Promise<number> {
    const { data, error } = await service
      .from("consulting_requests")
      .insert({
        title: `db-guards ${suffix}`,
        type: "ad_hoc",
        rate: 75,
        status: "approved",
        slack_channel: "C-TEST",
        slack_thread_ts: `${stamp}.${suffix}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as number;
  }

  async function billedEntries(requestId: number): Promise<number[]> {
    const data = await unwrapOrThrow(
      service
        .from("consulting_time_entries")
        .select("billed_min")
        .eq("request_id", requestId),
      "consulting_time_entries, a fixture read in db-guards",
    );
    return (data ?? []).map((e) => e.billed_min as number);
  }

  const complete = (requestId: number) =>
    service.rpc("complete_consulting_request", {
      p_request_id: requestId,
      p_billed_min: 90,
      p_summary: "Shipped it",
      p_pr_urls: ["https://github.com/x/y/pull/1"],
    });

  it("bills the work once and marks the request done", async () => {
    const id = await newRequest("happy");

    const { data, error } = await complete(id);

    expect(error).toBeNull();
    expect(data).toBe("completed");
    expect(await billedEntries(id)).toEqual([90]);
  });

  it("refuses a second /done and does NOT bill again", async () => {
    const id = await newRequest("twice");

    await complete(id);
    const { data } = await complete(id);

    expect(data).toBe("already_completed");
    expect(await billedEntries(id)).toEqual([90]);
  });

  it("bills once when two /done calls land SIMULTANEOUSLY", async () => {
    // The money case, and the one the old JavaScript status check could not
    // stop: both callers read a non-terminal status, both passed, and both
    // inserted a billable time entry, so the same work was invoiced twice.
    const id = await newRequest("race");

    const results = await Promise.all([complete(id), complete(id)]);

    const outcomes = results.map((r) => r.data).sort();
    expect(outcomes).toEqual(["already_completed", "completed"]);
    expect(await billedEntries(id)).toEqual([90]);
  });

  it("leaves the request unbilled and NOT done when the time entry is rejected", async () => {
    // The claim and the billing share one transaction, so a rejected time entry
    // has to roll the status back with it. Claiming in a separate round trip
    // would leave a completed request with no billing on it.
    const id = await newRequest("atomic");

    const { error } = await service.rpc("complete_consulting_request", {
      p_request_id: id,
      p_billed_min: -1, // violates billed_min >= 0
      p_summary: "Shipped it",
    });

    expect(error).not.toBeNull();
    expect(await billedEntries(id)).toEqual([]);

    const req = await unwrapOrThrow(
      service
        .from("consulting_requests")
        .select("status")
        .eq("id", id)
        .single(),
      "consulting_requests, a fixture read in db-guards",
    );
    expect(req?.status).toBe("approved");
  });
});

// ── #708 / #696 ───────────────────────────────────────────────────────────────
//
// The client mints the row's id, so a repeat of the same submission carries the
// same id and the database throws it away. That only holds if the database really
// does reject the duplicate under SIMULTANEOUS writes, which is the one thing a
// sequential test cannot show.

describe("client-minted ids make a repeat collide (issue #708)", () => {
  const id = (suffix: string) =>
    `00000000-0000-4000-8000-${stamp.toString().slice(-8)}${suffix}`;

  it("lets exactly one of two SIMULTANEOUS contact submissions through", async () => {
    const submissionId = id("0001");
    const row = {
      id: submissionId,
      name: "Reader",
      email: "reader@example.com",
      subject: "Hello",
      message: "A question about the platform.",
    };

    const results = await Promise.all([
      service.from("contact_submissions").insert(row),
      service.from("contact_submissions").insert(row),
    ]);

    expect(results.filter((r) => !r.error)).toHaveLength(1);

    const data = await unwrapOrThrow(
      service.from("contact_submissions").select("id").eq("id", submissionId),
      "contact_submissions, a fixture read in db-guards",
    );
    expect(data).toHaveLength(1);
  });

  it("rejects a repeated contact submission with 23505, which the action reads as 'already received'", async () => {
    const row = {
      id: id("0002"),
      name: "Reader",
      email: "reader@example.com",
      subject: "Hello",
      message: "A question about the platform.",
    };

    const first = await service.from("contact_submissions").insert(row);
    const second = await service.from("contact_submissions").insert(row);

    expect(first.error).toBeNull();
    expect(second.error?.code).toBe("23505");
  });
});

describe("uniq_consulting_requests_slack_view (migration 063, issue #708)", () => {
  const base = {
    title: "db-guards view id",
    slack_channel: "C-TEST",
  };

  it("refuses a second request for the same Slack modal", async () => {
    // Slack re-delivers a submission whose first delivery timed out, replaying
    // the identical payload. view.id is what stays stable across that retry.
    const viewId = `V-${stamp}-dup`;

    const first = await service.from("consulting_requests").insert({
      ...base,
      slack_thread_ts: `${stamp}.100`,
      slack_view_id: viewId,
    });
    const second = await service.from("consulting_requests").insert({
      ...base,
      // A re-delivery posts a NEW thread root, so the thread is different. Only
      // the view id ties the two together, which is the whole reason it exists:
      // the pre-existing unique index on the thread could never have caught this.
      slack_thread_ts: `${stamp}.200`,
      slack_view_id: viewId,
    });

    expect(first.error).toBeNull();
    expect(second.error?.code).toBe("23505");
  });

  it("still allows many requests that came from no modal at all", async () => {
    // The index is partial. Every row predating migration 063 has NULL here, and
    // a unique index that treated those as equal would make the migration
    // unappliable and block every non-modal insert.
    const a = await service.from("consulting_requests").insert({
      ...base,
      slack_thread_ts: `${stamp}.300`,
      slack_view_id: null,
    });
    const b = await service.from("consulting_requests").insert({
      ...base,
      slack_thread_ts: `${stamp}.400`,
      slack_view_id: null,
    });

    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });
});
