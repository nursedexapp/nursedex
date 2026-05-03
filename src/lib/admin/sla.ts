export type SlaState = "ok" | "approaching" | "overdue";

export const SLA_HOURS = { featured: 24, free: 72 } as const;

/**
 * Bucket a submission's age into ok / approaching / overdue.
 *
 * - "approaching" trips at 75% of the SLA so admins get a cue before
 *   they actually miss it (also matches the future cron alert
 *   threshold from the PRD).
 * - "overdue" trips at the SLA itself.
 */
export function getSlaState(
  hoursElapsed: number,
  slaHours: number,
): SlaState {
  if (hoursElapsed >= slaHours) return "overdue";
  if (hoursElapsed >= slaHours * 0.75) return "approaching";
  return "ok";
}

/**
 * Compare-fn for the verification queue: Featured first (priority lane),
 * then oldest submission first within each tier.
 */
export function compareVerificationQueueRows<
  T extends { tier: "free" | "featured"; submitted_at: string },
>(a: T, b: T): number {
  if (a.tier !== b.tier) return a.tier === "featured" ? -1 : 1;
  return (
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  );
}
