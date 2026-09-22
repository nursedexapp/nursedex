/**
 * What is left of the one-off licence number correction (#912): the way back.
 *
 * On 2026-09-03, 25 verified HHAs with no licence number were moved to
 * `rejected` and emailed to supply one. That rested on a misreading: the
 * dashboard gate demanded a licence number of HHAs and only HHAs, which was
 * the inverse of the wizard's rule, and the backfill took the gate at its
 * word. HHAs and CNAs are certified rather than licensed and have no number to
 * give, so not one of the 25 could act on it (found 2026-09-22).
 *
 * The send back mode is deleted rather than corrected, so it cannot be run
 * again. The restore stays, keyed on the reason string below.
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
