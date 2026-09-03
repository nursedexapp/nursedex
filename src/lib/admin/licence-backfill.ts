/**
 * The one-off correction for verified nurses with no licence number (#912).
 *
 * Verification could be granted to a profile with nothing in it, and 29 of the
 * 32 verified HHAs came away with the badge and no licence number, which is
 * the one field onboarding requires of an HHA and the one the check is
 * supposed to rest on. Measured against production on 2026-09-03.
 *
 * Dan's decision: send them back and ask. They land in the stored `rejected`
 * state, whose dashboard reads "Your verification needs a quick fix" and shows
 * the reason, rather than `pending`, whose dashboard promises an email the
 * moment her profile is live. Nothing would ever send that email, because
 * nothing happens until she supplies the number.
 *
 * The rule lives here rather than in the script so it can be tested, and so
 * the forward and reverse directions cannot drift apart.
 */

/**
 * Written into verification_rejected_reason, and shown to her on her own
 * dashboard under "What to fix".
 *
 * It doubles as the KEY for the reversal: the undo looks for exactly this
 * string, so it can never touch a nurse an admin rejected for a real reason.
 * Changing it after a run would strand that run's rows, so it is a constant
 * with a test, not a literal in the script.
 */
export const LICENCE_NEEDED_REASON =
  "We need your Home Health Aide license number. Add it to your profile and we will check it against the New York State register.";

/** The email_log type and key, so a re-run cannot email anybody twice. */
export const LICENCE_NEEDED_EMAIL_TYPE = "licence_number_needed";
export const LICENCE_NEEDED_DEDUP_KEY = "v1";

export type LicenceBacklogRow = {
  user_id: string;
  credential: string;
  license_number: string | null;
  verification_status: string;
  is_hidden: boolean;
  users: { is_deleted: boolean; is_suspended: boolean } | null;
};

/**
 * Whether this row is one of the ones to send back.
 *
 * Deliberately narrow. It is only ever the HHAs, because a licence number is
 * required of an HHA and of nobody else, and only nurses who are actually
 * reachable: a deleted or suspended account is not shown to families and
 * emailing it would be wrong.
 */
export function needsLicenceNumber(row: LicenceBacklogRow): boolean {
  if (row.verification_status !== "verified") return false;
  if (row.credential !== "hha") return false;
  if ((row.license_number ?? "") !== "") return false;
  if (row.is_hidden) return false;
  if (!row.users) return false;
  if (row.users.is_deleted || row.users.is_suspended) return false;
  return true;
}

/**
 * Whether this row is one THIS backfill sent back, and so may be restored.
 *
 * The reason string is the whole identification. A nurse an admin rejected by
 * hand carries a different reason and is never touched, and a nurse who has
 * since supplied her licence number is left alone as well, because restoring
 * her would undo a real admin decision made after this ran.
 */
export function wasSentBackByThisBackfill(row: {
  verification_status: string;
  verification_rejected_reason: string | null;
}): boolean {
  return (
    row.verification_status === "rejected" &&
    row.verification_rejected_reason === LICENCE_NEEDED_REASON
  );
}
