import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { isUniqueViolation } from "@/lib/db/postgres-errors";

interface SendOnceArgs {
  recipientUserId: string;
  emailType: string;
  dedupKey: string;
}

/** What happened to one recipient: it went, someone else had it, or it failed. */
export type SendOnceOutcome = "sent" | "skipped" | "failed";

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
  args: SendOnceArgs,
): Promise<boolean> {
  const { error } = await supabase.from("email_log").insert({
    recipient_user_id: args.recipientUserId,
    email_type: args.emailType,
    dedup_key: args.dedupKey,
  });

  if (!error) return true;

  // Not a failure: a concurrent caller (or an earlier run) already claimed this
  // email and is sending it. Staying quiet is the whole point.
  if (isUniqueViolation(error)) return false;

  console.error("[cron] email_log insert failed:", error.message);
  // Fail closed on a genuinely broken log: sending twice is worse than skipping
  // one notification.
  return false;
}

/**
 * Claim the dedup row, send, and RELEASE the claim if the send did not land
 * (#415).
 *
 * The claim has to be written before the send, or two overlapping runs both
 * email the same person. Left standing after a failed send it does the opposite
 * harm: it records that they were told, so every later run skips them and the
 * email is lost for good. That is why the release is here rather than at each
 * call site. Nine crons claimed and never released, while the not listed nudge
 * had the release written out correctly by hand, which is exactly the shape
 * that gets copied wrong the tenth time.
 *
 * If the send actually landed and only its reply failed, releasing means the
 * person may get it twice. That is much the better of the two mistakes: the
 * emails behind this are a payment failure notice, an access expiry warning and
 * a renewal reminder, and missing one silently is worse than seeing it again.
 *
 * `send` must REPORT whether the email went, so it returns a boolean rather
 * than void. A throw is treated as a failure too, and swallowed, because these
 * run in a loop and letting one network error escape would abandon every
 * recipient after it.
 */
export async function sendOnce(
  supabase: SupabaseClient,
  args: SendOnceArgs,
  send: () => Promise<boolean>,
): Promise<SendOnceOutcome> {
  const claimed = await shouldSendOnce(supabase, args);
  if (!claimed) return "skipped";

  let delivered = false;
  try {
    delivered = await send();
  } catch (err) {
    console.error(
      `[cron] ${args.emailType} could not be sent to ${args.recipientUserId}:`,
      err,
    );
  }

  if (delivered) return "sent";

  await releaseSendOnce(supabase, args);

  // A console line is not monitoring. These crons answer 200 on a partial
  // failure, so without this a swallowed send reaches nobody, every day, for as
  // long as it lasts.
  Sentry.captureMessage(
    `[cron] ${args.emailType} did not go out for ${args.recipientUserId}; the claim was released for the next run.`,
    "warning",
  );

  return "failed";
}

/**
 * Give back a claim so a later run can try again. Keyed on the same three
 * columns the claim is written with, in the same file, so the pair cannot drift
 * apart: a release keyed more loosely would delete other recipients' claims,
 * and one keyed more tightly would silently match nothing and leave the
 * person marked as told.
 */
async function releaseSendOnce(
  supabase: SupabaseClient,
  args: SendOnceArgs,
): Promise<void> {
  const { error } = await supabase
    .from("email_log")
    .delete()
    .eq("recipient_user_id", args.recipientUserId)
    .eq("email_type", args.emailType)
    .eq("dedup_key", args.dedupKey);

  if (error) {
    // The email is now lost for this recipient and nothing will retry it, which
    // is worth more than a warning.
    console.error("[cron] email_log claim release failed:", error.message);
    Sentry.captureMessage(
      `[cron] could not release the ${args.emailType} claim for ${args.recipientUserId}; they will not be retried.`,
      "error",
    );
  }
}
