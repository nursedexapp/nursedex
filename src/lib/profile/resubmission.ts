/**
 * What to write when a nurse who was rejected finishes fixing her profile.
 *
 * She returns to the review queue rather than staying rejected, and the
 * rejection reason is kept so the queue can badge her as a resubmission;
 * approval clears it.
 *
 * Shared by the two paths that can finish a profile, because they are not
 * interchangeable: the edit form is only reachable once onboarding is
 * complete, so a nurse whose profile is unfinished (#905) fixes it in the
 * wizard instead. The licence number backfill (#912) rejects 25 nurses and
 * tells each of them "add it and we will check it and put your badge back",
 * and 22 of those profiles are unfinished. Without this on the wizard's own
 * completion path, that promise would be false for every one of them: she
 * would fix the thing she was asked to fix and never re-enter the queue.
 */
export function resubmissionPatch(currentStatus: string | null | undefined): {
  verification_status?: "pending";
} {
  return currentStatus === "rejected"
    ? { verification_status: "pending" as const }
    : {};
}
