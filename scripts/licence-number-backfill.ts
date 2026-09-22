/**
 * Puts back the 25 HHAs the #912 backfill sent back on 2026-09-03.
 *
 * That backfill moved every verified HHA with no licence number to `rejected`
 * and asked her for one. It rested on the dashboard gate, which demanded a
 * licence number of HHAs and only HHAs, the inverse of the wizard's rule. HHAs
 * and CNAs are certified rather than licensed, so none of them had a number to
 * give (found 2026-09-22). The send back mode is deleted; only this remains.
 *
 * Keyed on the exact reason string, so a nurse an admin rejected for a real
 * reason is never touched. Sends nothing.
 *
 * DRY RUN unless CONFIRM=1.
 *
 * Usage:
 *   export NEXT_PUBLIC_SUPABASE_URL=...   # the target project
 *   export SUPABASE_SECRET_KEY=...        # service role key
 *   npx tsx scripts/licence-number-backfill.ts              # dry run
 *   CONFIRM=1 npx tsx scripts/licence-number-backfill.ts    # restore
 *
 * It prints user ids and counts, never names or contact details: this output
 * lands in a terminal and in transcripts.
 */

import { createClient } from "@supabase/supabase-js";
import { LICENCE_NEEDED_REASON } from "../src/lib/admin/licence-backfill";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CONFIRM = process.env.CONFIRM === "1";

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

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
    console.log("DRY RUN. Re-run with CONFIRM=1 to put them back.");
    return;
  }

  let restored = 0;
  let failed = 0;
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
      failed++;
      continue;
    }
    if ((updated ?? []).length === 0) {
      console.log(`  ${row.user_id}: skipped, no longer in that state`);
      continue;
    }
    restored++;
  }
  console.log(`Restored ${restored} of ${rows.length}.`);
  // A row that failed is still rejected, so a re-run picks it up.
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  console.log("");
  await restore();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
