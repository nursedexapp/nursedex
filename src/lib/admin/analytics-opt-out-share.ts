/**
 * How much of the funnel is missing because people asked not to be measured
 * (#910).
 *
 * `users.analytics_opt_out` means a person is entirely absent from PostHog
 * while fully present in the database. That is the point of the feature and it
 * works. Nothing counted them, so every PostHog funnel and acquisition number
 * silently excluded those people and no marker anywhere said how many.
 *
 * Today the count is zero, so nothing is wrong. The failure arrives later and
 * looks like something else: as opt-outs grow, the funnel reads low and the
 * shape resembles people dropping out of a flow rather than people never
 * having been measured, and whoever reads it has no way to tell those apart.
 * The sample shrinks as the feature succeeds, and a number calibrated on the
 * old sample turns into noise while still reading like a measurement (L350).
 *
 * Revenue is unaffected, which is worth saying because it is the natural
 * worry: MRR is counted from subscription rows at published prices and never
 * touches PostHog, so an opt-out costs a funnel data point and not a pound of
 * reported revenue.
 */

/**
 * The share past which the funnel stops being worth reading straight.
 *
 * A NUMBER NOBODY HAS MEASURED, and stated as such: the count is zero today,
 * so there is no distribution to calibrate against. Five per cent is the level
 * at which a funnel reading is systematically low by more than it is noisy,
 * which is the point at which somebody comparing two periods would draw a
 * wrong conclusion from it.
 *
 * Re-measure once there is a real number to look at.
 */
export const OPT_OUT_SHARE_THRESHOLD = 0.05;

/**
 * The share of a population that opted out, or null when there is no
 * population to be a share of.
 *
 * Null rather than zero. Zero over zero is NaN, which renders as "NaN%" and
 * compares false against every threshold, so the warning would never fire
 * while the screen carried a number that is not one (L50).
 */
export function optOutShare(
  optedOut: number,
  population: number,
): number | null {
  if (population <= 0) return null;
  if (optedOut > population) {
    // Refused rather than clamped. A share above 1 is the only self-evident
    // proof that the two counts were read over different populations, and a
    // quietly clamped value is indistinguishable from a correct one (L340,
    // L588).
    throw new Error(
      `More people opted out of analytics (${optedOut}) than there are ` +
        `accounts to opt out (${population}). The two counts are being read ` +
        "over different populations, so neither the share nor the funnel " +
        "warning built on it means anything.",
    );
  }
  return optedOut / population;
}

/**
 * Whether the share is high enough that the funnel should be read knowing it.
 *
 * A null share is not concerning: unknown is not the same as fine, but it is
 * not a reason to warn about a level nobody measured either. The panel says
 * which of the two it is looking at.
 */
export function isOptOutShareConcerning(share: number | null): boolean {
  if (share === null) return false;
  return share > OPT_OUT_SHARE_THRESHOLD;
}

/**
 * The sentence the analytics page shows about who is missing from the funnel.
 *
 * A function rather than markup so its three branches can be read back in a
 * test. The one that matters is the zero case: "0 accounts opted out (0%)"
 * reads as a measurement of nothing, while the real fact is that every signup
 * on the page is also in PostHog, which is the reassurance somebody comparing
 * the two numbers actually needs.
 */
export function optOutNoteText(optedOut: number, share: number | null): string {
  if (optedOut === 0) {
    return "No account has opted out of analytics, so every signup here is also in PostHog.";
  }

  const asShare = share === null ? "" : ` (${formatShare(share)})`;
  const warning = isOptOutShareConcerning(share)
    ? ` That is over ${formatShare(OPT_OUT_SHARE_THRESHOLD)}, enough that a funnel reading low there means fewer people measured rather than fewer people converting.`
    : "";

  return (
    `${optedOut} of these accounts opted out of analytics${asShare}, so they ` +
    `are in none of the PostHog funnels.${warning}`
  );
}

/** A share as a percentage, rounded to a whole one: nothing here needs more. */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}
