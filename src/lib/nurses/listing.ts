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
 * The same rule in TypeScript, for telling a nurse where she stands. Kept
 * beside the filter above, and pinned to it by listing.test.ts, because the
 * failure mode of two copies is the dashboard promising a nurse that families
 * can find her while the directory does not list her.
 */
export function isListed(profile: {
  has_photo: boolean;
  bio: string | null;
}): boolean {
  return profile.has_photo || (profile.bio ?? "") !== "";
}
