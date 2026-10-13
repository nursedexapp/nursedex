/** What the banner tallies. The migration's CHECK constraint lists the same three. */
export const CONSENT_EVENT_KINDS = ["shown", "accepted", "declined"] as const;
export type ConsentEventKind = (typeof CONSENT_EVENT_KINDS)[number];

export function isConsentEventKind(value: unknown): value is ConsentEventKind {
  return (CONSENT_EVENT_KINDS as readonly unknown[]).includes(value);
}
