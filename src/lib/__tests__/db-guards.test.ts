import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

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

const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } = getLiveSupabaseEnv();

// These tests force counters to their cap and replay payment events. They must
// never point at production; .env.local holds production credentials.
assertLocalSupabaseUrl(SUPABASE_URL, "Database guard tests");

const REVEALS_HARD_CAP = 25;
const REVEALS_CAPTCHA_THRESHOLD = 10;

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
  const { data } = await service
    .from("rate_limit_reveals")
    .select("reveal_count")
    .eq("family_user_id", familyId)
    .eq("date", today())
    .maybeSingle();
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
    await service
      .from("rate_limit_reveals")
      .delete()
      .eq("family_user_id", family)
      .eq("date", today());
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
    const { data } = await service
      .from("rate_limit_reveals")
      .select("captcha_triggered, consecutive_captcha_days")
      .eq("family_user_id", family)
      .eq("date", today())
      .single();
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

    const { data } = await service
      .from("rate_limit_reveals")
      .select("consecutive_captcha_days")
      .eq("family_user_id", family)
      .eq("date", today())
      .single();
    expect(data!.consecutive_captcha_days).toBe(3);

    await service
      .from("rate_limit_reveals")
      .delete()
      .eq("family_user_id", family)
      .eq("date", yesterday.toISOString().slice(0, 10));
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

  async function applyEvent(lastEventAt: string, status = "cancelled"): Promise<boolean> {
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
    const { data } = await service
      .from("subscriptions")
      .select("last_event_at")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    return data ? data.last_event_at : null;
  }

  afterAll(async () => {
    await service
      .from("subscriptions")
      .delete()
      .like("stripe_subscription_id", `sub_guard_${stamp}_%`);
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

    const { data } = await service
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", subId)
      .single();
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
