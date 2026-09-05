import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import path from "path";
import {
  judgeDelivery,
  type DeliveryRecord,
} from "@/lib/email/delivery-health";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

/**
 * Did the emails we sent actually ARRIVE? (#885)
 *
 * The neighbouring resend-health check lists the account's domains. That
 * proves the API key works and the account answers. It is not the same
 * question, and the difference is the whole of #885: the Slack alerting in
 * this project answered HTTP 200 to every request for months and delivered
 * nothing, because the bot was not in the channel. Our side was entirely
 * correct and the message did not arrive.
 *
 * Resend records what happened to each message after it accepted it, and
 * nothing here had ever read that. A send returning 200 only means Resend took
 * it; `bounced`, `complained` and an acceptance that is never confirmed are
 * all invisible from our side.
 *
 * WHAT THIS CANNOT PROVE, stated rather than left to be assumed: it reads what
 * Resend says happened to messages sent for real reasons. It sends nothing
 * itself, so it cannot manufacture evidence on a day nothing went out, and it
 * FAILS rather than passing in that case, because a window with nothing in it
 * and a window where everything arrived are otherwise the same green tick.
 *
 * It also says nothing about the two outward paths that are not Resend. The
 * Slack ops channel's membership and the Sentry project's liveness are #885's
 * other halves and are not covered here.
 *
 * NO ADDRESS IS EVER READ. The list endpoint returns recipients, and this
 * reads only `created_at` and `last_event`: a check that prints real people's
 * email addresses puts them into CI logs and transcripts by a route no privacy
 * guard inspects (L222).
 */

/** As many as the endpoint returns in one page, which is the whole window. */
const PAGE = 100;

describe("Resend delivery", () => {
  it("confirms the emails we sent actually arrived", async () => {
    const key = process.env.RESEND_API_KEY;
    // Deliberately a FAILURE, never a skip. A check that quietly stands down
    // when it is not configured reports healthy while measuring nothing.
    expect(
      key,
      "RESEND_API_KEY is not set, so nothing is checking that our email is being delivered rather than merely accepted.",
    ).toBeTruthy();
    if (!key) return;

    const res = await fetch(`https://api.resend.com/emails?limit=${PAGE}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(
      res.ok,
      `Resend refused the delivery list with HTTP ${res.status}, so this check could not look.`,
    ).toBe(true);
    if (!res.ok) return;

    const body = (await res.json()) as { data?: unknown };
    const rows = body.data;

    // A payload this cannot read is its own failure, never an empty window.
    // The two would otherwise both arrive as "nothing sent" and send whoever
    // reads it to look at the senders rather than at this check.
    expect(
      Array.isArray(rows),
      "Resend answered in a shape this check does not understand, so nothing was measured.",
    ).toBe(true);
    if (!Array.isArray(rows)) return;

    const records: DeliveryRecord[] = rows.map((r) => {
      const row = r as Partial<DeliveryRecord>;
      return {
        created_at: String(row.created_at ?? ""),
        last_event: String(row.last_event ?? ""),
      };
    });

    const verdict = judgeDelivery(records, new Date());

    // Said on every outcome, including the healthy one, so a green run carries
    // the numbers rather than only the runs that fail.
    console.log(`[resend-delivery] ${verdict.state}: ${verdict.message}`);

    expect(verdict.ok, verdict.message).toBe(true);
  }, 30_000);
});
