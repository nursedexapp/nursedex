/**
 * Launch cleanup.
 *
 * Two independent operations, both DRY RUN unless CONFIRM=1:
 *
 *  1. HIDE the demo seed nurses (nurse_profiles.is_seed = true) by setting
 *     is_hidden = true (migration 041). Hidden profiles drop out of search,
 *     the public profile page, the sitemap, saves, and reveals WITHOUT
 *     deleting any data. Reversible: run with RESTORE=1 to set is_hidden back
 *     to false. Hiding also resets verification_status to 'verified' to undo
 *     the earlier launch hack that hid seeds via verification_status='rejected'
 *     (before the dedicated flag existed), so re-running reconciles them.
 *
 *  2. DELETE the real test accounts named in TEST_EMAILS (comma-separated).
 *     Deletes the auth user, which cascades to public.users and every
 *     dependent row (ON DELETE CASCADE). support@nursedex.com (the super
 *     admin) is hard-protected and can never be deleted by this script.
 *
 * Usage:
 *   export NEXT_PUBLIC_SUPABASE_URL=...      # the target project
 *   export SUPABASE_SECRET_KEY=...           # service role key
 *   # Dry run (prints what it would do, changes nothing):
 *   TEST_EMAILS="a@x.com,b@y.com" npx tsx scripts/launch-cleanup.ts
 *   # Execute:
 *   TEST_EMAILS="a@x.com,b@y.com" CONFIRM=1 npx tsx scripts/launch-cleanup.ts
 *   # Restore the hidden seed nurses:
 *   RESTORE=1 CONFIRM=1 npx tsx scripts/launch-cleanup.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const CONFIRM = process.env.CONFIRM === "1";
const RESTORE = process.env.RESTORE === "1";
const TEST_EMAILS = (process.env.TEST_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Accounts that must never be deleted by this script, whatever is passed in.
const PROTECTED = new Set(["support@nursedex.com"]);
const PHOTO_BUCKET = "nurse-photos";

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const mode = CONFIRM ? "EXECUTE" : "DRY RUN";

async function hideOrRestoreSeedNurses() {
  const targetHidden = !RESTORE;
  const { data: rows, error } = await supabase
    .from("nurse_profiles")
    .select("user_id, is_hidden")
    .eq("is_seed", true);
  if (error) {
    console.error("Failed to read seed nurses:", error.message);
    process.exit(1);
  }
  const seeds = rows ?? [];
  console.log(
    `\n[seed nurses] ${seeds.length} found (is_seed=true). ` +
      `${RESTORE ? "Restoring (is_hidden=false)" : "Hiding (is_hidden=true)"}.`,
  );
  const toChange = seeds.filter((r) => r.is_hidden !== targetHidden);
  console.log(
    `  ${toChange.length} need changing (already ${targetHidden ? "hidden" : "visible"}: ${seeds.length - toChange.length}).`,
  );
  if (!CONFIRM) return;

  // When hiding, also reset verification_status to 'verified' to undo the
  // earlier hack that hid seeds via verification_status='rejected'.
  const update = targetHidden
    ? { is_hidden: true, verification_status: "verified" as const }
    : { is_hidden: false };
  const { error: upErr } = await supabase
    .from("nurse_profiles")
    .update(update)
    .eq("is_seed", true);
  if (upErr) {
    console.error("  Update failed:", upErr.message);
    process.exit(1);
  }
  console.log(
    `  Done: ${seeds.length} seed nurses set to is_hidden=${targetHidden}.`,
  );
}

async function deleteTestAccounts() {
  if (RESTORE) return; // restore mode never deletes
  if (TEST_EMAILS.length === 0) {
    console.log("\n[test accounts] none passed (set TEST_EMAILS). Skipping.");
    return;
  }
  console.log(`\n[test accounts] ${TEST_EMAILS.length} requested for deletion.`);
  for (const email of TEST_EMAILS) {
    if (PROTECTED.has(email)) {
      console.error(`  REFUSING to delete protected account: ${email}`);
      continue;
    }
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, role")
      .ilike("email", email)
      .maybeSingle();
    if (error) {
      console.error(`  ${email}: lookup failed: ${error.message}`);
      continue;
    }
    if (!user) {
      console.log(`  ${email}: not found, skipping.`);
      continue;
    }
    console.log(`  ${email}: role=${user.role} id=${user.id} -> DELETE`);
    if (!CONFIRM) continue;

    // Storage objects are not cascade-deleted; clear the user's folder.
    const { data: files } = await supabase.storage
      .from(PHOTO_BUCKET)
      .list(user.id);
    if (files && files.length > 0) {
      await supabase.storage
        .from(PHOTO_BUCKET)
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error(`  ${email}: delete failed: ${delErr.message}`);
      continue;
    }
    console.log(`  ${email}: deleted.`);
  }
}

async function main() {
  console.log(`Launch cleanup — mode: ${mode}${RESTORE ? " (RESTORE)" : ""}`);
  console.log(`Target: ${SUPABASE_URL}`);
  await hideOrRestoreSeedNurses();
  await deleteTestAccounts();
  if (!CONFIRM) {
    console.log("\nDRY RUN only. Re-run with CONFIRM=1 to apply.");
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
