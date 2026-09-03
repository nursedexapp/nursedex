import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyUnlistedNurseFilter } from "@/lib/nurses/visibility";
import { sendNotListedNudgeEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL_TYPE = "not_listed_nudge";
const DEDUP_KEY = "v1";

/**
 * Tells a verified nurse whose profile is empty that families cannot see her.
 *
 * She is verified but not in the directory, because there is no photo and no
 * bio on her profile (#732). The in-product version of this message sits on
 * the bio and photo step of the sign-up wizard, which only reaches her if she
 * comes back on her own. 27 of the 40 in this state signed up before July.
 *
 * Safe to run daily: the email_log dedup keeps a nurse from getting it more
 * than once, and she stops matching the query the moment she adds either
 * thing.
 *
 * IT DOES NOT SEND UNTIL SWITCHED ON. NOT_LISTED_NUDGE_SEND must be exactly
 * "true". The default is the quiet one on purpose: forgetting to set it means
 * nobody is emailed, rather than 40 people being emailed by a deploy. Run it
 * switched off first and read `wouldSend`, which names the size of the send
 * without making it.
 */
const handleNotListedNudge = withCronAlerting(
  "not-listed-nudge",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();

    const nurseQuery = supabase.from("nurse_profiles").select(
      `
      user_id,
      users!inner ( email, first_name, is_deleted, is_suspended )
    `,
    );
    const { data, error } = await applyUnlistedNurseFilter(nurseQuery);

    if (error) {
      // A failed read is not an empty roster. Returning success here would
      // report a healthy run that quietly told nobody.
      console.error("[cron not-listed-nudge] query failed:", error.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    type Row = {
      user_id: string;
      users: {
        email: string;
        first_name: string | null;
        is_deleted: boolean;
        is_suspended: boolean;
      };
    };

    const rows = (data ?? []) as unknown as Row[];

    if (process.env.NOT_LISTED_NUDGE_SEND !== "true") {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldSend: rows.length,
        sent: 0,
      });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const ok = await shouldSendOnce(supabase, {
        recipientUserId: row.user_id,
        emailType: EMAIL_TYPE,
        dedupKey: DEDUP_KEY,
      });
      if (!ok) {
        skipped++;
        continue;
      }

      const delivered = await sendNotListedNudgeEmail({
        to: row.users.email,
        firstName: row.users.first_name ?? undefined,
      });

      if (delivered) {
        sent++;
        continue;
      }

      // The claim is written before the send so two overlapping runs cannot
      // both email her. Left standing after a failure it would mark her as
      // told forever, and she is exactly the person who needs telling. So
      // release it and let tomorrow's run try again. If the send actually
      // landed and only the reply failed, she gets it twice, which is much
      // the better of the two mistakes.
      failed++;
      await supabase
        .from("email_log")
        .delete()
        .eq("recipient_user_id", row.user_id)
        .eq("email_type", EMAIL_TYPE)
        .eq("dedup_key", DEDUP_KEY);
    }

    if (failed > 0) {
      console.error(
        `[cron not-listed-nudge] ${failed} of ${rows.length} nudges did not go out; their claims were released for the next run.`,
      );
    }

    return NextResponse.json({ success: true, sent, skipped, failed });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handleNotListedNudge(request);
}
