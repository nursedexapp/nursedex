/**
 * Sentry tags whose only job is to keep a class of event out of the Slack
 * relay, by being excluded from the query in `issues.ts`.
 *
 * The key is `action` for all of them, because `issues.ts` already excludes
 * `action:cron` and `action:stripe-webhook` that way and a second key is a
 * second thing to remember when reading the query.
 *
 * Why a tag rather than the event's LEVEL: Sentry's issue search matches a
 * GROUP when ANY event in it carries the value. NURSEDEX-SITE-11 holds two
 * error events and one warning event, and is returned by `level:warning` and
 * by `level:[error,fatal]` alike, so a group that has ever held an error can
 * never be filtered out by level again. Grouping keys on the stack trace, so
 * rewording the message does not start a fresh group either. Measured against
 * the live project on 2026-09-21; the tag partitions cleanly there
 * (`action:cron` 2, `!action:cron` 18, 20 issues in the project).
 */
export interface AlertTag {
  readonly key: "action";
  readonly value: string;
}

/**
 * A multipart POST that named no live Server Action. Never attributable: a
 * stale tab with JavaScript never reaches the throwing code at all, so this is
 * either a no-JS form post from a page older than the deployment or junk, and
 * no header separates them. Anyone with curl can mint it, so it must never
 * page anyone (NURSEDEX-SITE-10, NURSEDEX-SITE-11).
 */
export const UNATTRIBUTABLE_POST: AlertTag = {
  key: "action",
  value: "unattributable-post",
};
