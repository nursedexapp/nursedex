/**
 * Which flagged families count as flagged NOW (#425).
 *
 * A family is flagged after RATE_LIMITS.CONSECUTIVE_CAPTCHA_DAYS_FLAG
 * consecutive days of tripping the captcha threshold. The row recording that
 * stays in rate_limit_reveals forever, so a query with no window counts every
 * family ever flagged: the daily admin digest then reported the same historical
 * families indefinitely, never returned to zero, and stopped carrying any
 * information about current risk.
 *
 * One window, shared by the digest and the admin screen it links to. A count
 * and the rows it promises have to come from one predicate, or the email says
 * four and the page shows one (L16).
 */

/**
 * How recent a flag has to be to still count, in days, today included.
 *
 * Seven: a family that has not tripped the threshold in a week is not a
 * current risk, and the digest clears a week after the behaviour stops rather
 * than never. Short enough that the count tracks what is happening now, long
 * enough that a family who reveals on weekdays only is not dropped between one
 * digest and the next.
 */
export const FLAGGED_RECENT_DAYS = 7;

/**
 * The earliest date still inside the window, as the YYYY-MM-DD the `date`
 * column holds.
 *
 * Computed in UTC because the database keys those rows on CURRENT_DATE, which
 * is UTC. Deriving it from local time would move the boundary by a day
 * depending on where the code runs, and the digest would count a different set
 * of families on a machine in New York than on one in London (L39).
 */
export function flaggedSinceDate(now: Date): string {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - (FLAGGED_RECENT_DAYS - 1));
  return start.toISOString().slice(0, 10);
}
