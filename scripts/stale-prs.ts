/**
 * Pull requests that have been open, and usually red, for weeks (#907).
 *
 * Nothing reported this, so a PR could sit failing indefinitely and look
 * exactly like a repo where nobody is working. PR #713 was open from
 * 2026-07-13 to 2026-09-02, failing one check the whole time, and it carried
 * the fix for three p0 privacy issues: a privacy policy making claims the code
 * did not honour, and personal data reaching session replay. The failing check
 * was a test reading a gitignored file, so it could never have passed however
 * long it waited.
 *
 * The cost is not the PR, it is what the PR was carrying. A red run and a
 * refused run also look identical in a list, so this doubles as an early
 * warning that CI itself has stopped.
 *
 * Everything here is pure so the decisions have tests; the API reads and the
 * Slack post live in check-stale-prs.ts.
 */

/**
 * How long a pull request may sit before it is worth saying so.
 *
 * Two weeks: long enough that ordinary review back and forth does not trip it,
 * short enough that six weeks of a live privacy misstatement would have been
 * reported four times before it was found by accident.
 */
export const STALE_AFTER_DAYS = 14;

/** Dependabot's author login on this repo's pull requests. */
const DEPENDABOT = "app/dependabot";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PrRecord {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
  author: string;
  /**
   * Four states, not two. A red run, a refused run and a run still going look
   * identical in a list, and calling any of them passing is the reassuring
   * answer and the wrong one (L98, L11). "running" earns its place here
   * because this report only ever looks at pull requests a fortnight old: a
   * check still going after two weeks is stuck, which is its own thing to say.
   */
  checks: "passing" | "failing" | "running" | "unknown";
}

export interface StalePr extends PrRecord {
  ageDays: number;
}

export interface PrVerdict {
  failing: boolean;
  note: string;
}

/** What this PR's checks are doing, in a sentence somebody can act on. */
export function classifyPr(pr: PrRecord): PrVerdict {
  if (pr.checks === "failing") {
    return { failing: true, note: "checks failing" };
  }
  if (pr.checks === "running") {
    return { failing: false, note: "checks still running after all this time" };
  }
  if (pr.checks === "unknown") {
    return { failing: false, note: "checks could not be read" };
  }
  return { failing: false, note: "checks passing" };
}

/**
 * The open pull requests old enough to report, oldest first.
 *
 * A draft is excluded however old: it is a PR somebody is deliberately not
 * finishing, so reporting it weekly teaches the reader to skim the whole list,
 * and a list people skim reports nothing (L36).
 */
export function selectStalePrs(prs: PrRecord[], now: Date): StalePr[] {
  const stale: StalePr[] = [];

  for (const pr of prs) {
    if (pr.isDraft) continue;

    const created = Date.parse(pr.createdAt);
    // Refused rather than skipped. A date that will not parse is NaN, and NaN
    // compares false against every threshold, so the PR would be judged fresh
    // forever and land on the permissive side with nothing raised (L50).
    if (!Number.isFinite(created)) {
      throw new Error(
        `The created date on pull request #${pr.number} could not be read ` +
          `(${pr.createdAt}), so its age is unknown and it would silently ` +
          "never be reported.",
      );
    }

    const ageDays = Math.floor((now.getTime() - created) / DAY_MS);
    if (ageDays >= STALE_AFTER_DAYS) {
      stale.push({ ...pr, ageDays });
    }
  }

  return stale.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * The message.
 *
 * Failing ones lead, because a PR that cannot land as it is needs different
 * work from one that is merely waiting. Dependabot's are counted rather than
 * listed: they arrive in batches and would crowd out the one PR somebody
 * actually has to act on, which is how a list stops being read. #814 triages
 * those specifically.
 */
export function summariseStalePrs(stale: StalePr[], openCount: number): string {
  if (stale.length === 0) {
    return (
      `No open pull request has been waiting ${STALE_AFTER_DAYS} days or ` +
      `more. ${openCount} open in total.`
    );
  }

  const bot = stale.filter((pr) => pr.author === DEPENDABOT);
  const ours = stale.filter((pr) => pr.author !== DEPENDABOT);

  // Failing first within the ours group, oldest first within each half.
  const ordered = [
    ...ours.filter((pr) => classifyPr(pr).failing),
    ...ours.filter((pr) => !classifyPr(pr).failing),
  ];

  const lines = ordered.map(
    (pr) =>
      `#${pr.number} ${pr.title} (${pr.ageDays} days, ${classifyPr(pr).note})\n${pr.url}`,
  );

  if (bot.length > 0) {
    const failing = bot.filter((pr) => classifyPr(pr).failing).length;
    lines.push(
      `Plus ${bot.length} dependabot pull request${bot.length === 1 ? "" : "s"} ` +
        `over ${STALE_AFTER_DAYS} days old (${failing} failing). Triaging those is #814.`,
    );
  }

  return (
    `${ordered.length} pull request${ordered.length === 1 ? " has" : "s have"} ` +
    `been open ${STALE_AFTER_DAYS} days or more, out of ${openCount} open.\n\n` +
    lines.join("\n\n")
  );
}

/**
 * The Slack title for a reading, or null when Slack should not hear about it.
 *
 * #1079. This used to speak every week, quiet weeks included, so that silence
 * could be told apart from the job having stopped. The Job Watchdog now
 * answers that question for this workflow: it derives its watched set from the
 * workflow files themselves rather than a hand kept list, so stale-prs.yml is
 * covered without anybody adding it, and it is covered demonstrably, because
 * on 2026-09-15 the watchdog was the thing that reported this job had never
 * completed successfully on its schedule.
 *
 * It also answers it better. The watchdog knows this job's expected interval
 * and speaks when it is late, where a weekly all clear relied on a person
 * noticing an absence, which is not something people do.
 *
 * L98 is NOT being relaxed. L98 says a watcher that finds nothing must treat
 * that as its own non success outcome rather than reporting green, and that is
 * honoured where it matters: a failed read throws in check-stale-prs.ts, so
 * "nothing stale" can never be said by a run that could not look. What goes is
 * the announcement of a genuine quiet week, which is noise (L36). The full
 * report is still printed to the run log on every run, so the reading itself
 * is never suppressed, only its delivery to Slack.
 */
export function announcementTitle(staleCount: number): string | null {
  if (staleCount === 0) return null;
  return "Pull requests have been open for weeks";
}
