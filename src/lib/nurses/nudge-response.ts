import "server-only";
import { createClient } from "@/lib/supabase/server";
import { applyListedNurseFilter } from "./visibility";

/**
 * Whether the two supply side sends moved anybody (#947).
 *
 * On 2026-09-03, 25 verified nurses were asked for a licence number after
 * being sent back (#912), and on 2026-09-04, 18 were told families cannot see
 * them (#925). All 43 were confirmed delivered. Those two sends are the whole
 * of the supply side push, and their effect is the only evidence the approach
 * works. Nothing measured it, so the only way to know was to run a query by
 * hand, which means nobody would, and the next decision about nudging nurses
 * would be made on a hunch.
 *
 * WHAT "MOVED" MEANS is drawn from the directory's own predicates, never a
 * second set of conditions written here. A change to what counts as listed
 * lands in this number and in the directory at once, so the readout cannot
 * reassure somebody about a population the directory does not show.
 *
 * IT REPORTS MOVEMENT, NOT CAUSE. A nurse who became listed after being told
 * may have been prompted by the email or by anything else; this says she moved
 * and deliberately does not claim why (L192). What makes the number meaningful
 * is the cohort: each email only goes to nurses in the state it describes, so
 * anybody out of that state now has moved out of it since being told.
 */

/** The email types worth watching, and what acting on each one looks like. */
export const NUDGE_COHORTS = [
  {
    emailType: "not_listed_nudge",
    /** She was told families cannot see her; acting on it means being listed. */
    label: "Not listed nudge",
    acted: "become listed in the directory",
  },
  {
    emailType: "licence_number_needed",
    /**
     * She was sent back and asked for a licence number, so acting on it means
     * BOTH: the number is on file and she is back in the review queue.
     *
     * Deliberately not judged through the visible filter, which requires
     * verified: every nurse in this cohort is rejected by construction, so
     * that filter would report nobody having acted however many of them had.
     */
    label: "Licence number request",
    acted: "supplied a licence number and returned to the review queue",
  },
] as const;

export type NudgeEmailType = (typeof NUDGE_COHORTS)[number]["emailType"];

export interface NudgeCohort {
  emailType: NudgeEmailType;
  label: string;
  acted: string;
  told: number;
  /** Null when nobody was told: there is no date, and no send to judge. */
  firstSentAt: string | null;
  lastSentAt: string | null;
  moved: number;
}

export type NudgeResponse =
  | { ok: true; cohorts: NudgeCohort[] }
  | { ok: false; failed: string; message: string };

/**
 * PostgREST returns a healthy looking prefix rather than an error when a
 * select exceeds its cap, so a cohort larger than this would be judged on its
 * first page and the proportion would be about a population nobody chose. The
 * read asks for one more row than the cap so hitting it is detectable at all.
 */
export const TOLD_CAP = 1000;

export async function getNudgeResponse(): Promise<NudgeResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email_log")
    .select("recipient_user_id, email_type, sent_at")
    .in(
      "email_type",
      NUDGE_COHORTS.map((c) => c.emailType),
    )
    .order("sent_at", { ascending: true })
    .limit(TOLD_CAP + 1);

  // A failed read is not "nobody was told". Reporting it as zero would put
  // "the sends reached nobody" on the screen in the one situation where
  // nobody can tell that from the truth (L98).
  if (error) {
    return {
      ok: false,
      failed: "who was told",
      message: error.message,
    };
  }

  const rows = (data ?? []) as Array<{
    recipient_user_id: string;
    email_type: string;
    sent_at: string;
  }>;

  if (rows.length > TOLD_CAP) {
    return {
      ok: false,
      failed: "who was told",
      message:
        `More than ${TOLD_CAP} sends have been recorded, so this list is not ` +
        "complete and the proportions below would be about a population " +
        "nobody chose. The read needs paging before this number means anything.",
    };
  }

  const cohorts: NudgeCohort[] = [];

  for (const cohort of NUDGE_COHORTS) {
    const mine = rows.filter((r) => r.email_type === cohort.emailType);
    const ids = [...new Set(mine.map((r) => r.recipient_user_id))];

    if (ids.length === 0) {
      // Nobody told is its own state. Asking about an empty set would be a
      // query nobody needs, and a query nobody needs is a query that can fail.
      cohorts.push({
        ...cohort,
        told: 0,
        firstSentAt: null,
        lastSentAt: null,
        moved: 0,
      });
      continue;
    }

    const base = supabase
      .from("nurse_profiles")
      // The owner conditions applyVisibleNurseFilter applies live on the users
      // row, so the embed has to be inner or a count would include nurses
      // whose owner is deleted or suspended.
      .select("user_id, users!inner(is_deleted, is_suspended)", {
        count: "exact",
        head: true,
      })
      .in("user_id", ids);

    const query =
      cohort.emailType === "not_listed_nudge"
        ? applyListedNurseFilter(base)
        : base
            .eq("verification_status", "pending")
            .not("license_number", "is", null)
            .neq("license_number", "");

    const { count, error: countError } = await query;

    if (countError) {
      return {
        ok: false,
        failed: cohort.label,
        message: countError.message,
      };
    }
    // A read that succeeded without a count is an absence of measurement, and
    // zero is the one value that would read as a real answer (L90).
    if (count === null) {
      return {
        ok: false,
        failed: cohort.label,
        message: "The database returned no count for this cohort.",
      };
    }

    cohorts.push({
      ...cohort,
      told: ids.length,
      firstSentAt: mine[0].sent_at,
      lastSentAt: mine[mine.length - 1].sent_at,
      moved: count,
    });
  }

  return { ok: true, cohorts };
}
