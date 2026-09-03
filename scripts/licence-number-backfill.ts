/**
 * The one-off correction for verified nurses with no licence number (#912).
 *
 * Verification never consulted whether the nurse had provided anything, so 29
 * of the 32 verified HHAs hold the badge with no licence number on file, which
 * is the one field onboarding requires of an HHA. Measured against production
 * on 2026-09-03.
 *
 * Dan's decision: send them back and ask. Each one is moved to the stored
 * `rejected` state, whose dashboard reads "Your verification needs a quick fix"
 * and shows the reason, and is emailed once. `pending` was the other candidate
 * and is wrong: its dashboard promises an email the moment her profile is
 * live, and nothing would ever send it, because nothing happens until she
 * supplies the number.
 *
 * DRY RUN unless CONFIRM=1. Reversible with RESTORE=1.
 *
 * Usage:
 *   export NEXT_PUBLIC_SUPABASE_URL=...   # the target project
 *   export SUPABASE_SECRET_KEY=...        # service role key
 *   export CRON_SECRET=...                # to reach the email route
 *   npx tsx scripts/licence-number-backfill.ts              # dry run
 *   CONFIRM=1 npx tsx scripts/licence-number-backfill.ts    # do it
 *   RESTORE=1 CONFIRM=1 npx tsx scripts/licence-number-backfill.ts
 *
 * It prints user ids and counts, never names or email addresses: this output
 * lands in a terminal and in transcripts.
 */

import { createClient } from "@supabase/supabase-js";
import {
  needsLicenceNumber,
  LICENCE_NEEDED_REASON,
  LICENCE_NEEDED_EMAIL_TYPE,
  LICENCE_NEEDED_DEDUP_KEY,
  type LicenceBacklogRow,
} from "../src/lib/admin/licence-backfill";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.BASE_URL ?? "https://nursedex.com";
const CONFIRM = process.env.CONFIRM === "1";
const RESTORE = process.env.RESTORE === "1";

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

type Row = LicenceBacklogRow & {
  users: {
    is_deleted: boolean;
    is_suspended: boolean;
    email: string;
    first_name: string | null;
  } | null;
};

async function sendEmail(to: string, firstName: string | null) {
  if (!CRON_SECRET) throw new Error("CRON_SECRET is not set.");
  const res = await fetch(`${BASE_URL}/api/email/licence-number-needed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ to, firstName: firstName ?? undefined }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `email route answered ${res.status}: ${body.slice(0, 200)}`,
    );
  }
}

async function restore() {
  const { data, error } = await db
    .from("nurse_profiles")
    .select("user_id, verification_status, verification_rejected_reason")
    .eq("verification_status", "rejected")
    .eq("verification_rejected_reason", LICENCE_NEEDED_REASON);

  if (error)
    throw new Error(`Could not read the rows to restore: ${error.message}`);

  const rows = data ?? [];
  console.log(`${rows.length} nurse(s) were sent back by this backfill.`);
  if (!CONFIRM) {
    console.log("DRY RUN. Re-run with RESTORE=1 CONFIRM=1 to put them back.");
    return;
  }

  let restored = 0;
  for (const row of rows) {
    // Guarded on both the status and the reason, so a nurse an admin has
    // touched since is left exactly as the admin left her.
    const { data: updated, error: updateError } = await db
      .from("nurse_profiles")
      .update({
        verification_status: "verified",
        verification_rejected_reason: null,
      })
      .eq("user_id", row.user_id)
      .eq("verification_status", "rejected")
      .eq("verification_rejected_reason", LICENCE_NEEDED_REASON)
      .select("user_id");

    if (updateError) {
      console.error(`  ${row.user_id}: FAILED ${updateError.message}`);
      continue;
    }
    if ((updated ?? []).length === 0) {
      console.log(`  ${row.user_id}: skipped, no longer in that state`);
      continue;
    }
    restored++;
  }
  console.log(`Restored ${restored} of ${rows.length}.`);
}

async function apply() {
  const { data, error } = await db
    .from("nurse_profiles")
    .select(
      `user_id, credential, license_number, verification_status, is_hidden,
       users!inner ( is_deleted, is_suspended, email, first_name )`,
    )
    .eq("verification_status", "verified")
    .eq("credential", "hha");

  if (error) throw new Error(`Could not read the roster: ${error.message}`);

  const all = (data ?? []) as unknown as Row[];
  // The tested predicate decides, not the query: the query narrows what comes
  // back over the wire, and this is what says who is actually affected.
  const targets = all.filter((row) => needsLicenceNumber(row));

  console.log(`Verified HHAs read: ${all.length}`);
  console.log(`Of those, no licence number and reachable: ${targets.length}`);
  for (const row of targets) console.log(`  ${row.user_id}`);

  if (!CONFIRM) {
    console.log("");
    console.log(
      "DRY RUN. Nothing was changed and nobody was emailed. Re-run with CONFIRM=1.",
    );
    return;
  }
  if (!CRON_SECRET) {
    console.error("CRON_SECRET is not set, so nobody could be told. Stopping.");
    process.exit(1);
  }

  let changed = 0;
  let emailed = 0;
  let alreadyTold = 0;
  let failed = 0;

  for (const row of targets) {
    // Status first, then the email. The other order tells a nurse her
    // verification is paused before it is, and if the write then fails she is
    // looking at a verified profile and an email saying otherwise.
    const { data: updated, error: updateError } = await db
      .from("nurse_profiles")
      .update({
        verification_status: "rejected",
        verification_rejected_reason: LICENCE_NEEDED_REASON,
      })
      .eq("user_id", row.user_id)
      .eq("verification_status", "verified")
      .select("user_id");

    if (updateError) {
      console.error(`  ${row.user_id}: FAILED ${updateError.message}`);
      failed++;
      continue;
    }
    if ((updated ?? []).length === 0) {
      console.log(`  ${row.user_id}: skipped, no longer verified`);
      continue;
    }
    changed++;

    // The claim is written before the send so a second run cannot email her
    // twice, and released again when the send fails, or she is marked as told
    // and never hears from us.
    const { error: claimError } = await db.from("email_log").insert({
      recipient_user_id: row.user_id,
      email_type: LICENCE_NEEDED_EMAIL_TYPE,
      dedup_key: LICENCE_NEEDED_DEDUP_KEY,
    });
    if (claimError) {
      alreadyTold++;
      continue;
    }

    try {
      await sendEmail(row.users!.email, row.users!.first_name);
      emailed++;
    } catch (err) {
      failed++;
      console.error(
        `  ${row.user_id}: email FAILED, ${(err as Error).message}`,
      );
      await db
        .from("email_log")
        .delete()
        .eq("recipient_user_id", row.user_id)
        .eq("email_type", LICENCE_NEEDED_EMAIL_TYPE)
        .eq("dedup_key", LICENCE_NEEDED_DEDUP_KEY);
    }
  }

  console.log("");
  console.log(
    `Sent back: ${changed}. Emailed: ${emailed}. Already told: ${alreadyTold}. Failed: ${failed}.`,
  );
  if (failed > 0) {
    console.log("Re-run to retry the failures; nobody is emailed twice.");
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(RESTORE ? "Mode: RESTORE" : "Mode: SEND BACK");
  console.log("");
  if (RESTORE) {
    await restore();
  } else {
    await apply();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
