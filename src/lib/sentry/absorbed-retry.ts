import * as Sentry from "@sentry/nextjs";

/**
 * The tag on every refusal that one retry absorbed.
 *
 * The Slack relay leaves this tag out (NEEDS_REVIEW_QUERY in ./issues), by
 * tag and not by level for the reason written there. So an absorbed refusal
 * is a count in Sentry and never a post: the visitor got what they asked for,
 * and there is nothing for anybody to do about one.
 */
export const ABSORBED_RETRY_TAG = { key: "retry", value: "absorbed" };

/**
 * Count a refusal that the retry absorbed (L77).
 *
 * A retry that is only absorbed hides blips growing common. Counted here, a
 * service that starts refusing every tenth call shows as a rising number in
 * Sentry long before two refusals in a row turn into an error and a page.
 *
 * Keep `message` free of anything that varies per call (a path, an id):
 * Sentry groups messages by their text, and one count per photo is no count.
 */
export function reportAbsorbedRetry(
  message: string,
  tags: Record<string, string> = {},
): void {
  Sentry.captureMessage(message, {
    level: "warning",
    tags: { ...tags, [ABSORBED_RETRY_TAG.key]: ABSORBED_RETRY_TAG.value },
  });
}
