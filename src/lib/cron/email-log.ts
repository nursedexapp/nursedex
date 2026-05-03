import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cron-safe send-once: returns true the first time we want to send a
 * specific email_type for a recipient + dedup_key combo, and false on
 * every subsequent call within the same dedup window. Call this BEFORE
 * firing the email; if it returns true, send; if false, skip.
 *
 * email_log uses (recipient_user_id, email_type, dedup_key) as the
 * conceptual key. We don't have a unique constraint there (the
 * column-level UNIQUE would have to be a partial index), so we read
 * first and insert second. Crons run once a day so the race window is
 * negligible in practice.
 */
export async function shouldSendOnce(
  supabase: SupabaseClient,
  args: {
    recipientUserId: string;
    emailType: string;
    dedupKey: string;
  },
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("email_log")
    .select("id")
    .eq("recipient_user_id", args.recipientUserId)
    .eq("email_type", args.emailType)
    .eq("dedup_key", args.dedupKey)
    .maybeSingle();
  if (existing) return false;

  const { error } = await supabase.from("email_log").insert({
    recipient_user_id: args.recipientUserId,
    email_type: args.emailType,
    dedup_key: args.dedupKey,
  });
  if (error) {
    console.error("[cron] email_log insert failed:", error.message);
    // Don't send on a failed log write — risk of duplicate sends if
    // the log is broken is worse than skipping a single notification.
    return false;
  }
  return true;
}
