/**
 * The day the cookie banner went live in production. Every PostHog number
 * after it counts only browsers that accepted (L683), so each surface that
 * shows a PostHog number carries this caption. Set in the launch step.
 */
export const CONSENT_LAUNCH_DATE: string | null = null;

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function postHogCoverageCaption(
  launch: string | null = CONSENT_LAUNCH_DATE,
): string | null {
  if (!launch) return null;
  return `From ${FORMAT.format(new Date(`${launch}T00:00:00Z`))}, PostHog counts only browsers that accepted the cookie banner.`;
}
