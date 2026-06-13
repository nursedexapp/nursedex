// Presentation helpers for the admin analytics "Subscriptions" signal. Kept
// pure (no DB, no clock) so they are deterministic and unit-testable; the
// caller passes `now`.

/** A compact "x ago" string for a past ISO timestamp. */
export function formatTimeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (Number.isNaN(then)) return "unknown";
  if (diffMs < 0) return "just now";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * The sub-line under the Subscriptions stat. Distinguishes a never-touched
 * pipeline from one the webhook has written to, and how recently.
 */
export function subscriptionPipelineLabel(
  lastSyncAt: string | null,
  now: number,
): string {
  if (!lastSyncAt) return "No webhook events yet";
  return `Last webhook write ${formatTimeAgo(lastSyncAt, now)}`;
}
