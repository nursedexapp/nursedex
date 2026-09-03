/**
 * The one definition of "enough of a profile to put in front of a family".
 *
 * A verified nurse who has filled in nothing is not shown to somebody who did
 * not ask for her by name (#732). She stays reachable by her own link, stays
 * in a family's saves and reveals, and keeps every nurse-facing email.
 *
 * The rule is deliberately about what the profile CONTAINS rather than about
 * the stored profile_completeness score, so a stale score (#727) can never
 * change who is listed.
 */

/**
 * The rule as a PostgREST `or` filter, for the surfaces that DISCOVER nurses.
 * `bio.neq.` is "not the empty string", which excludes null as well.
 */
export const LISTED_MINIMUM_CONTENT = "has_photo.eq.true,bio.neq.";

/**
 * The second half of the rule, applied as its own condition rather than
 * folded into the `or` above (#940).
 *
 * Being visible is not the same as being findable. `care_type` is the filter
 * families narrow the directory by, and it matches on the `care_types` array,
 * so a nurse with an empty one is returned by no filtered search at all. She
 * could reach the directory on a photo alone, which is exactly what the not
 * listed nudge asks her for, and then sit in it unreachable.
 *
 * Measured against the live API on 2026-09-03 before it was added: of the 100
 * visible nurses, 22 had no care type and every one of them was already
 * unlisted, so this removed nobody. It closes the case rather than fixing a
 * live one.
 */
export const LISTED_CARE_TYPES_PRESENT = {
  column: "care_types",
  notEqualTo: "{}",
} as const;

/** Why a nurse is not in the directory. */
export type ListingGap = "content" | "care_type";

type ListingInput = {
  has_photo: boolean;
  bio: string | null;
  care_types: string[] | null;
};

/**
 * What a nurse is missing before the directory will show her.
 *
 * The surfaces that tell her WHY (the notice in the wizard, the nudge email)
 * read this, and isListed below is derived from it, so the screen that says
 * whether and the screen that says why cannot come to disagree.
 */
export function listingGaps(profile: ListingInput): ListingGap[] {
  const gaps: ListingGap[] = [];
  if (!profile.has_photo && (profile.bio ?? "") === "") gaps.push("content");
  if ((profile.care_types ?? []).length === 0) gaps.push("care_type");
  return gaps;
}

/**
 * The same rule in TypeScript, for telling a nurse where she stands. Kept
 * beside the filter above, and pinned to it by listing.test.ts, because the
 * failure mode of two copies is the dashboard promising a nurse that families
 * can find her while the directory does not list her.
 */
export function isListed(profile: ListingInput): boolean {
  return listingGaps(profile).length === 0;
}

/**
 * The same rule inverted, for finding the nurses who are NOT listed so they
 * can be told (#732).
 *
 * One `or` group rather than two conditions, because the rule it inverts is
 * now a conjunction: not listed means no content OR no care type (#940). The
 * nesting was run against the live API before it was written here, since
 * PostgREST refuses some groupings that read perfectly well, and it returned
 * the same 40 the previous form did.
 *
 * Together with the listed filter it partitions the visible roster exactly,
 * measured on 2026-09-03 as 60 listed plus 40 unlisted out of 100 visible.
 * The admin coverage panel (#939) re-checks that sum on every load, so a
 * change to one of these two that misses the other is reported rather than
 * quietly dropping nurses out of both.
 */
export const UNLISTED_FILTER =
  "and(has_photo.eq.false,or(bio.is.null,bio.eq.)),care_types.eq.{}";
