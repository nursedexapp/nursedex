// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  judgeDelivery,
  MAX_FAILED_SHARE,
  MINIMUM_SENDS,
  CONFIRMATION_GRACE_MS,
  type DeliveryRecord,
} from "./delivery-health";

/**
 * #885. The Slack alerting in this project answered HTTP 200 to every request
 * for months and delivered nothing, because the bot was not in the channel:
 * our side was entirely correct and the message did not arrive. Every other
 * outward path has the same shape, and the daily Resend check proves only that
 * the API key works.
 *
 * These cover the judgement. A status code is not a delivery, and the states
 * that matter most are the ones that would otherwise read as fine.
 */
const NOW = new Date("2026-09-05T12:00:00Z");
const agedMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const record = (
  last_event: string,
  ageMs = CONFIRMATION_GRACE_MS * 2,
): DeliveryRecord => ({ created_at: agedMs(ageMs), last_event });

const many = (last_event: string, n: number) =>
  Array.from({ length: n }, () => record(last_event));

describe("a window with nothing in it", () => {
  it("is refused, not passed", () => {
    // A window with nothing in it and a window where everything arrived are
    // the same green tick, and the first means the senders have stopped, which
    // is the failure this exists to notice (L98).
    const verdict = judgeDelivery([], NOW);

    expect(verdict.state).toBe("nothing_sent");
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/nothing here proves delivery works/i);
  });
});

describe("emails that did not get there", () => {
  it.each(["bounced", "complained", "failed", "canceled"])(
    "counts %s as a failure",
    (event) => {
      const verdict = judgeDelivery(
        [...many("delivered", 9), record(event)],
        NOW,
      );

      expect(verdict.failed).toBe(1);
      expect(verdict.delivered).toBe(9);
    },
  );

  it("passes a rate inside the tolerance", () => {
    const verdict = judgeDelivery(
      [...many("delivered", 99), record("bounced")],
      NOW,
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.state).toBe("healthy");
  });

  it("refuses a rate past it, and says what to do", () => {
    const failed = Math.ceil(100 * MAX_FAILED_SHARE) + 1;
    const verdict = judgeDelivery(
      [...many("delivered", 100 - failed), ...many("bounced", failed)],
      NOW,
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.state).toBe("failing");
    // A number on its own is not a detector: it has to say what is now
    // different to do (L357).
    expect(verdict.message).toMatch(/suppression list|DNS/i);
  });

  it("fires on every message failing, even at the smallest judgeable sample", () => {
    // A volume floor applied to the FRACTION rather than the sample silences
    // the saturation case, which is the loudest version of this defect (L139).
    const verdict = judgeDelivery(many("bounced", MINIMUM_SENDS), NOW);

    expect(verdict.ok).toBe(false);
    expect(verdict.state).toBe("failing");
  });
});

describe("emails accepted but never confirmed", () => {
  it("does not count a message sent moments ago", () => {
    // Acceptance without confirmation is ordinary for a message sent minutes
    // ago, and counting it would fail this check whenever a cron had just run.
    const verdict = judgeDelivery(
      [...many("delivered", 10), record("sent", 60_000)],
      NOW,
    );

    expect(verdict.stale).toBe(0);
    expect(verdict.ok).toBe(true);
  });

  it("counts one that has sat past the grace period", () => {
    const verdict = judgeDelivery(
      [...many("delivered", 10), record("sent", CONFIRMATION_GRACE_MS + 1000)],
      NOW,
    );

    expect(verdict.stale).toBe(1);
  });

  it("refuses a window where nothing at all was confirmed", () => {
    // Resend accepting everything and confirming nothing is what "our side is
    // correct and it did not arrive" looks like here.
    const verdict = judgeDelivery(many("sent", 12), NOW);

    expect(verdict.ok).toBe(false);
    expect(verdict.state).toBe("unconfirmed");
    expect(verdict.message).toMatch(/acceptance is not delivery/i);
  });

  it("does not refuse while some are confirmed", () => {
    // A few unconfirmed alongside real deliveries is a slow receiving server,
    // not a broken path, and failing on it would cry wolf.
    const verdict = judgeDelivery(
      [...many("delivered", 10), ...many("sent", 2)],
      NOW,
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.stale).toBe(2);
  });

  it("counts a created date it cannot read as unconfirmed, not as fine", () => {
    // NaN compares false against every threshold, so an unreadable date would
    // otherwise be silently dropped and land on the permissive side (L50).
    const verdict = judgeDelivery(
      [{ created_at: "not a date", last_event: "sent" }],
      NOW,
    );

    expect(verdict.stale).toBe(1);
  });
});

describe("a window too small to judge", () => {
  it("passes and says it is not judging", () => {
    // Failing on a quiet week would make this cry wolf, and a check people
    // ignore reports nothing (L36). Saying so is what keeps it honest.
    const verdict = judgeDelivery(many("delivered", MINIMUM_SENDS - 1), NOW);

    expect(verdict.state).toBe("too_few_to_judge");
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toMatch(/needed before the failure rate says/i);
  });

  it("still refuses a small window where everything is unconfirmed", () => {
    // The sample floor guards the RATE, not the check. Three emails accepted
    // hours ago and none confirmed is not a sample problem.
    const verdict = judgeDelivery(many("sent", 3), NOW);

    expect(verdict.ok).toBe(false);
    expect(verdict.state).toBe("unconfirmed");
  });
});

describe("the healthy case", () => {
  it("reports the counts it measured, not just a pass", () => {
    // "Everything is fine" from a window of ten and from a window of a
    // thousand read the same, and one of them means the senders nearly
    // stopped (L98).
    const verdict = judgeDelivery(many("delivered", 92), NOW);

    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("92");
    expect(verdict.delivered).toBe(92);
  });
});
