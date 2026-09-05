/**
 * Whether the emails we sent actually ARRIVED (#885).
 *
 * The daily Resend check proves the API key works and the account answers. It
 * does not prove a sent email was accepted rather than bounced, suppressed, or
 * dropped for a domain reputation reason, and those are the failures that look
 * exactly like nobody signing up.
 *
 * This is the shape #885 is about. The Slack alerting in this project answered
 * HTTP 200 to every request for months and delivered nothing, because the bot
 * was not in the channel: our side was entirely correct and the message did not
 * arrive. A status code is not a delivery, and Resend exposes the delivery
 * event per email, which nothing here had ever read.
 *
 * WHAT IT CANNOT PROVE, said here rather than left to be assumed: it reads
 * what Resend says happened to messages we already sent for real reasons. It
 * sends nothing itself, so it cannot prove the path works on a day nothing was
 * sent, and it says so instead of reporting a pass.
 */

/** One email as Resend's list endpoint describes it. Addresses deliberately unused. */
export interface DeliveryRecord {
  created_at: string;
  last_event: string;
}

/**
 * The events that mean the message did not get there.
 *
 * "complained" is included: a spam complaint is a delivery that damages the
 * domain's ability to make the next one, so it belongs with the failures
 * rather than in the healthy pile.
 */
const FAILED_EVENTS = new Set(["bounced", "complained", "failed", "canceled"]);

/** The event that means Resend has confirmed it landed. */
const DELIVERED = "delivered";

/**
 * Accepted, with the receiving server not having answered yet. Normal for a
 * message sent moments ago and a problem when it is the whole population.
 */
const ACCEPTED = "sent";

/**
 * How much of the window may have failed before the domain is in trouble.
 *
 * Measured 2026-09-05: 92 of 92 recent messages delivered, none bounced. The
 * five per cent is the level at which mailbox providers start treating a
 * sender as a problem, so it is a threshold about the outside world rather
 * than one calibrated on our own history, which currently has nothing in it to
 * calibrate from.
 */
export const MAX_FAILED_SHARE = 0.05;

/**
 * The fewest messages worth computing a share over.
 *
 * It guards the SAMPLE, never the fraction: one bounce out of one is noise,
 * and twenty out of twenty is the loudest possible version of this defect and
 * still fires (L139).
 */
export const MINIMUM_SENDS = 10;

/**
 * How long a message may sit accepted before its silence means something.
 *
 * A message sent minutes ago has not been confirmed yet and that is ordinary.
 * One sent hours ago and still unconfirmed is a delivery nobody can vouch for.
 */
export const CONFIRMATION_GRACE_MS = 60 * 60 * 1000;

export type DeliveryVerdict = {
  state:
    | "nothing_sent"
    | "too_few_to_judge"
    | "failing"
    | "unconfirmed"
    | "healthy";
  ok: boolean;
  sent: number;
  delivered: number;
  failed: number;
  /** Accepted, past the grace period, and still not confirmed. */
  stale: number;
  message: string;
};

/**
 * Judge a window of sends.
 *
 * Every unhappy state is its own, because they need different work: nothing
 * sent means look at the senders, too few means wait, failing means look at
 * the domain's reputation, and unconfirmed means Resend has stopped hearing
 * back from the receiving servers.
 */
export function judgeDelivery(
  records: DeliveryRecord[],
  now: Date,
): DeliveryVerdict {
  const sent = records.length;

  const counts = {
    delivered: 0,
    failed: 0,
    stale: 0,
  };

  for (const record of records) {
    if (record.last_event === DELIVERED) {
      counts.delivered += 1;
      continue;
    }
    if (FAILED_EVENTS.has(record.last_event)) {
      counts.failed += 1;
      continue;
    }
    if (record.last_event !== ACCEPTED) continue;

    // Only an accepted message OLD enough to have been confirmed counts as
    // unconfirmed. A message sent moments ago is not evidence of anything, and
    // counting it would make this check fail whenever a cron had just run.
    const age = now.getTime() - Date.parse(record.created_at);
    // A created date that will not parse is NaN, and NaN compares false
    // against every threshold, so it would silently never be counted (L50).
    // Counted as stale instead: a record whose age cannot be read is one this
    // check cannot vouch for, which is the same thing it is reporting.
    if (!Number.isFinite(age) || age > CONFIRMATION_GRACE_MS) {
      counts.stale += 1;
    }
  }

  const base = {
    sent,
    delivered: counts.delivered,
    failed: counts.failed,
    stale: counts.stale,
  };

  if (sent === 0) {
    return {
      ...base,
      state: "nothing_sent",
      // NOT a pass. A window with nothing in it and a window where everything
      // arrived are the same green tick, and the first means the senders have
      // stopped, which is the failure this check exists to notice (L98).
      ok: false,
      message:
        "Resend has no record of any email in this window. Nothing was sent, " +
        "or sending has stopped: either way nothing here proves delivery works.",
    };
  }

  if (counts.failed / sent > MAX_FAILED_SHARE) {
    return {
      ...base,
      state: "failing",
      ok: false,
      message:
        `${counts.failed} of ${sent} recent emails bounced, were refused or ` +
        `were complained about, over the ${Math.round(MAX_FAILED_SHARE * 100)}% ` +
        "this tolerates. That is a domain reputation problem, and it gets " +
        "worse on its own: check the sending domain's DNS and Resend's " +
        "suppression list.",
    };
  }

  if (counts.stale > 0 && counts.delivered === 0) {
    return {
      ...base,
      state: "unconfirmed",
      ok: false,
      message:
        `Resend accepted ${counts.stale} email(s) over an hour ago and has ` +
        "confirmed none of them delivered. Acceptance is not delivery, so " +
        "nothing here says these arrived.",
    };
  }

  if (sent < MINIMUM_SENDS) {
    return {
      ...base,
      state: "too_few_to_judge",
      // Passes, and says it is not judging. Failing on a quiet week would make
      // this check cry wolf, and a check people ignore reports nothing (L36).
      ok: true,
      message:
        `Only ${sent} email(s) in the window, and ${MINIMUM_SENDS} are needed ` +
        `before the failure rate says anything. ${counts.delivered} delivered, ` +
        `${counts.failed} did not.`,
    };
  }

  return {
    ...base,
    state: "healthy",
    ok: true,
    message:
      `${counts.delivered} of ${sent} recent emails confirmed delivered, ` +
      `${counts.failed} failed, ${counts.stale} still unconfirmed after an hour.`,
  };
}
