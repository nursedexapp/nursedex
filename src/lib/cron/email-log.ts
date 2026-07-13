import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Postgres unique_violation: someone else logged this exact email first. */
const UNIQUE_VIOLATION = "23505";

/**
 * Send-once: returns true the first time we want to send a specific email_type
 * for a recipient + dedup_key combo, and false on every subsequent call. Call
 * this BEFORE firing the email; if it returns true, send; if false, skip.
 *
 * The INSERT is the gate (#663). This used to SELECT for an existing row, decide
 * in JavaScript, and insert only if it found none, which is the same
 * check-then-write race as #651/#652/#653: two callers both read nothing, both
 * insert, and both send. The old comment here waved that off on the grounds that
 * "crons run once a day so the race window is negligible in practice", and that
 * was wrong on both counts. This helper is not cron-only (the Stripe webhook,
 * which Stripe retries concurrently, and a nurse-triggered hire resend, which a
 * person can double-click, both go through it), and a cron that overlaps or is
 * retried races with itself anyway.
 *
 * `uniq_email_log_dedup` (migration 062) now makes the triple a real key, so the
 * loser of the race gets 23505 back and sends nothing. The database decides, not
 * a gap between two round trips.
 */
export async function shouldSendOnce(
  supabase: SupabaseClient,
  args: {
    recipientUserId: string;
    emailType: string;
    dedupKey: string;
  },
): Promise<boolean> {
  const { error } = await supabase.from("email_log").insert({
    recipient_user_id: args.recipientUserId,
    email_type: args.emailType,
    dedup_key: args.dedupKey,
  });

  if (!error) return true;

  // Not a failure: a concurrent caller (or an earlier run) already claimed this
  // email and is sending it. Staying quiet is the whole point.
  if (error.code === UNIQUE_VIOLATION) return false;

  console.error("[cron] email_log insert failed:", error.message);
  // Fail closed on a genuinely broken log: sending twice is worse than skipping
  // one notification.
  return false;
}
