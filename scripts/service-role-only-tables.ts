/**
 * The tables the Data API deliberately cannot reach (#520).
 *
 * Every table in the migrations must be decided about in exactly one of two
 * places: a GRANT or REVOKE naming it, or this list. A table in neither fails
 * the check, which is the point: the `waitlist` table was missed entirely by
 * the least-privilege migration, its anon INSERT grant was silently dropped by
 * a blanket REVOKE, and that shipped to production and broke pre-launch
 * signups. Nothing noticed, because nothing required a decision to exist.
 *
 * BEING ON THIS LIST IS A CLAIM: every read and write of that table goes
 * through the service-role client, so a caller holding only their own JWT can
 * do nothing with it. Each entry below was checked against the code on
 * 2026-09-05 by finding every `from("<table>")` and reading which client built
 * the query.
 *
 * That check found a live defect on its first run: the admin nudge panel read
 * `email_log` with the caller's own JWT, which production refuses outright, so
 * the panel could only ever have rendered its error state.
 *
 * Adding an entry here is not paperwork. If the app ever needs to touch one of
 * these with a caller's own JWT, the answer is a GRANT in a migration and a
 * removal from this list, not a service-role client reached for to get past a
 * permission error: RLS is the second layer, and the grant is the first.
 */
export const SERVICE_ROLE_ONLY_TABLES = [
  // Who has been removed and may not sign up again. Written and read by the
  // admin account actions and the signup path, both service role.
  "blocked_emails",

  // The blog's own taxonomy and history. Every read goes through
  // src/lib/blog/*, which uses the service-role client for all of these;
  // blog_posts is the one a visitor's own JWT reads, and it IS granted.
  "blog_categories",
  "blog_tags",
  "blog_post_tags",
  "blog_post_revisions",
  "blog_slug_redirects",
  "blog_taxonomy_redirects",

  // Comments are read for the public page and written by the form, both
  // through the service-role client so moderation state is never the only
  // thing standing between a visitor and an unapproved comment.
  "blog_comments",

  // The consulting workflow, driven entirely from Slack routes and the
  // estimate job. No browser ever touches these.
  "consulting_requests",
  "consulting_time_entries",

  // The dedup record behind every cron email. Written by sendOnce and read by
  // the admin nudge readout, both service role.
  "email_log",

  // When each cron last got through. Written by withCronAlerting and read by
  // the internal heartbeat route and the admin jobs page, all service role.
  "job_heartbeats",

  // Subscribers and their confirmation tokens. The subscribe and confirm
  // actions are service role on purpose: the unique email constraint is the
  // arbiter, and an anon-reachable INSERT policy here was removed by migration
  // 044 precisely because the app never used that path.
  "newsletter_subscribers",

  // Alert bookkeeping, written and read only by their own cron routes.
  "sentry_issue_alert_log",
  "webhook_alert_log",
] as const;
