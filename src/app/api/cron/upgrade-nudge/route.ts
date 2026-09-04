import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { sendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { sendUpgradeNudgeEmail } from "@/lib/email/send";
import {
  UPSELL_SAVE_THRESHOLD,
  UPSELL_COOLDOWN_DAYS,
} from "@/lib/profile/upsell";

import { toTypedFailure } from "@/lib/db/results";
export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wednesday 14:40 UTC. Free + verified nurses with at least
 * UPSELL_SAVE_THRESHOLD family saves on file get a nudge,
 * rate-limited via last_upsell_shown_at to once per
 * UPSELL_COOLDOWN_DAYS days. Reuses the same gate fields the
 * in-app save-driven toast uses, so an aggressive day on the
 * dashboard UI silences the email and vice versa.
 */
const handleUpgradeNudge = withCronAlerting(
  "upgrade-nudge",
  async (_request: NextRequest) => {
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
    let failed = 0;

    for (const row of (data ?? []) as unknown as Row[]) {
      const user = row.users;
      const outcome = await sendOnce(
        supabase,
        {
          recipientUserId: row.user_id,
          emailType: "upgrade_nudge",
          dedupKey: `week_${todayBucket}`,
        },
        () =>
          sendUpgradeNudgeEmail({
            to: user.email,
            firstName: user.first_name ?? undefined,
            saveCount: row.save_count_for_upsell,
          }),
      );
      if (outcome === "skipped") {
        skipped++;
        continue;
      }
      // A failed send has had its claim released, so the next run tries again.
      // The cooldown stamp below must not be written for a nudge she never
      // received, or the in-app toast goes quiet as well (#415).
      if (outcome === "failed") {
        failed++;
        continue;
      }

      // Stamp last_upsell_shown_at so the in-app toast also respects the
      // cooldown started by this email. Reported, not thrown: the email has
      // ALREADY gone out by this point, so failing the job would not unsend
      // it, and the throw would abandon every nurse still to be nudged in
      // this run. What a failed write costs is an in-app toast that ignores
      // the cooldown for one nurse (#847).
      await toTypedFailure(
        supabase
          .from("nurse_profiles")
          .update({ last_upsell_shown_at: new Date().toISOString() })
          .eq("user_id", row.user_id),
        "the upsell cooldown stamp after a nudge email",
      );
      sent++;
    }

    if (sent === 0 && failed > 0) {
      return NextResponse.json(
        { error: "Every upgrade nudge failed to send", sent, skipped, failed },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, sent, skipped, failed });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleUpgradeNudge(request);
}
