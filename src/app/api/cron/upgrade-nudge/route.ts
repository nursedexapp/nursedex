import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { sendUpgradeNudgeEmail } from "@/lib/email/send";
import {
  UPSELL_SAVE_THRESHOLD,
  UPSELL_COOLDOWN_DAYS,
} from "@/lib/profile/upsell";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wednesday 14:00 UTC. Free + verified nurses with at least
 * UPSELL_SAVE_THRESHOLD family saves on file get a nudge,
 * rate-limited via last_upsell_shown_at to once per
 * UPSELL_COOLDOWN_DAYS days. Reuses the same gate fields the
 * in-app save-driven toast uses, so an aggressive day on the
 * dashboard UI silences the email and vice versa.
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  const supabase = createServiceRoleClient();
  const cooldownCutoff = new Date(
    Date.now() - UPSELL_COOLDOWN_DAYS * DAY_MS,
  ).toISOString();

  const nurseQuery = supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      save_count_for_upsell,
      last_upsell_shown_at,
      users!inner (email, first_name, is_deleted, is_suspended)
    `,
    )
    .eq("tier", "free");
  const { data, error } = await applyVisibleNurseFilter(nurseQuery)
    .gte("save_count_for_upsell", UPSELL_SAVE_THRESHOLD)
    .or(
      `last_upsell_shown_at.is.null,last_upsell_shown_at.lt.${cooldownCutoff}`,
    );

  if (error) {
    console.error("[cron upgrade-nudge] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  type Row = {
    user_id: string;
    save_count_for_upsell: number;
    last_upsell_shown_at: string | null;
    users: {
      email: string;
      first_name: string | null;
      is_deleted: boolean;
      is_suspended: boolean;
    };
  };

  const todayBucket = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;

  for (const row of (data ?? []) as unknown as Row[]) {
    const ok = await shouldSendOnce(supabase, {
      recipientUserId: row.user_id,
      emailType: "upgrade_nudge",
      dedupKey: `week_${todayBucket}`,
    });
    if (!ok) {
      skipped++;
      continue;
    }

    await sendUpgradeNudgeEmail({
      to: row.users.email,
      firstName: row.users.first_name ?? undefined,
      saveCount: row.save_count_for_upsell,
    });
    // Stamp last_upsell_shown_at so the in-app toast also respects the
    // cooldown started by this email.
    await supabase
      .from("nurse_profiles")
      .update({ last_upsell_shown_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
    sent++;
  }

  return NextResponse.json({ success: true, sent, skipped });
}
