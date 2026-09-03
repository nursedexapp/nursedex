import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  applyVisibleNurseFilter,
  applyListedNurseFilter,
  applyUnlistedNurseFilter,
  applyAvailabilityFilter,
} from "./visibility";

/**
 * How much of the verified roster the directory is actually showing (#939).
 *
 * Measured by hand against production on 2026-09-03: 100 verified, 60 listed,
 * 59 returnable by a default search. That reading existed on one day, in a
 * terminal, and nothing in the product would have noticed the gap growing
 * back. This is the instrument.
 *
 * The four query shapes below were run against the live API on 2026-09-03 and
 * returned 100, 60, 59 and 40, which is the hand measurement they replace.
 *
 * Every count is drawn through the same predicates the directory filters on
 * (visibility.ts) rather than through a second set of conditions written
 * here. A rule change lands in both at once, so the number and the directory
 * cannot disagree about who is listed.
 */
export type DirectoryCoverage =
  | {
      ok: true;
      /** Verified, not hidden, owner neither deleted nor suspended. */
      verified: number;
      /** Of those, enough profile to be put in front of a family. */
      listed: number;
      /** Of those, what a default search can actually return today. */
      searchable: number;
      /** The complement: verified nurses families cannot see at all. */
      unlisted: number;
      /**
       * Whether listed + unlisted came to verified. The two predicates are
       * meant to partition the visible roster exactly, and nothing else
       * compares them, so a drift shows up here rather than as a quietly
       * wrong directory.
       */
      reconciles: boolean;
    }
  | { ok: false; failed: CoverageCount; message: string };

export type CoverageCount = "verified" | "listed" | "searchable" | "unlisted";

/**
 * The four conditions applyVisibleNurseFilter needs on the owner row have to
 * come from an inner embed, or a count would include nurses whose owner is
 * deleted or suspended.
 */
const COUNT_SELECT = "user_id, users!inner(is_deleted, is_suspended)";

export async function getDirectoryCoverage(): Promise<DirectoryCoverage> {
  const supabase = await createClient();

  const countQuery = () =>
    supabase.from("nurse_profiles").select(COUNT_SELECT, {
      count: "exact",
      head: true,
    });

  const [verified, listed, searchable, unlisted] = await Promise.all([
    applyVisibleNurseFilter(countQuery()),
    applyListedNurseFilter(countQuery()),
    applyAvailabilityFilter(applyListedNurseFilter(countQuery()), {
      relaxed: false,
    }),
    applyUnlistedNurseFilter(countQuery()),
  ]);

  const results: Array<
    [CoverageCount, { count: number | null; error: { message: string } | null }]
  > = [
    ["verified", verified],
    ["listed", listed],
    ["searchable", searchable],
    ["unlisted", unlisted],
  ];

  for (const [name, result] of results) {
    // A read that failed, and a read that came back without a count, are both
    // an absence of measurement. Reporting either as 0 would put "the
    // directory is empty" on the screen in the one situation where nobody can
    // tell that from the truth.
    if (result.error) {
      return { ok: false, failed: name, message: result.error.message };
    }
    if (result.count === null) {
      return {
        ok: false,
        failed: name,
        message: "The database returned no count for this query.",
      };
    }
  }

  const counts = Object.fromEntries(
    results.map(([name, result]) => [name, result.count as number]),
  ) as Record<CoverageCount, number>;

  return {
    ok: true,
    ...counts,
    reconciles: counts.listed + counts.unlisted === counts.verified,
  };
}
