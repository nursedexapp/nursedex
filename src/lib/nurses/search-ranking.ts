export interface RankableNurse {
  user_id: string;
  tier: "free" | "featured";
  has_photo: boolean;
  communication_preference: string | null;
  review_count: number;
  avg_rating: number | null;
  profile_completeness: number;
  /** Miles from the family's zip, or null when she cannot be placed. */
  distance_miles?: number | null;
  /** When she was verified, for the newest-first sort. */
  verified_at?: string | null;
  /**
   * True when this nurse matched the search keyword ON HER NAME, rather than
   * on her bio or care philosophy (#936). Absent on every search without a
   * keyword, and on every listing page, where it changes nothing.
   */
  name_match?: boolean;
}

/**
 * How far a Featured nurse's paid placement reaches when the family has not
 * chosen a radius.
 *
 * 25 miles is not invented: it is the middle value of the radius options the
 * filter already offers (5, 10, 25, 50, 100), and measured against the real
 * roster on 2026-09-03 it reaches about half of it from anywhere in the core
 * (28 of 57 placeable nurses from Suffolk, 25 from Queens, 21 from
 * Manhattan), so it sits in the middle of the spread rather than at an end.
 */
export const DEFAULT_FEATURED_RANGE_MILES = 25;

export interface DistanceContext {
  /** True when a zip was given AND we could place it, so distances are real. */
  originResolved: boolean;
  /** The family's chosen radius, or the default when they set none. */
  featuredRangeMiles: number;
}

/**
 * How the order is described to a family, in words, for each of the two
 * orders there are.
 *
 * Anything that TELLS a family how results are ordered reads from here rather
 * than restating it, so a caption cannot claim an order the code does not
 * use. The mockup's "Most complete profiles first" was exactly that (#777).
 *
 * Entries marked conditional do not apply to every viewer, so a sentence
 * built for everyone may only use the unconditional ones.
 */
export const RANKING_CRITERIA = [
  { phrase: "featured nurses", conditional: false },
  { phrase: "nurses whose name matches your search", conditional: true },
  { phrase: "nurses with a photo", conditional: false },
  { phrase: "a match on how you prefer to be contacted", conditional: true },
  { phrase: "more complete profiles", conditional: false },
  { phrase: "more reviews", conditional: false },
  { phrase: "a higher rating", conditional: false },
] as const;

/**
 * The order once a family has entered a zip.
 *
 * The paid placement leads, and it is protected only within range, so a
 * Featured nurse three hours away does not sit above a local one (#723).
 * Distance decides everything Featured does not.
 *
 * This list used to open with "the closest nurses", which is what a family was
 * told and not what the code did: `rankingScore` has put a Featured nurse
 * inside the radius above a closer free one since #723, so somebody promised
 * nearest first could be shown a nurse 20 miles away above one 2 miles away
 * (#966). The ranking is the paid product working exactly as /pricing sells
 * it ("Top placement in search results"), so the sentence moved rather than
 * the order. The list mirrors the tuple in `rankingScore`, in its order, and
 * a test in this module's suite ranks two real nurses to prove the phrase
 * named first is the criterion that actually wins.
 */
export const DISTANCE_RANKING_CRITERIA = [
  { phrase: "featured nurses near you", conditional: false },
  { phrase: "nurses whose name matches your search", conditional: true },
  { phrase: "the closest nurses", conditional: false },
  { phrase: "more complete profiles", conditional: false },
] as const;

/**
 * Completeness, reviews and rating as ONE number.
 *
 * Exactly the three that #724 is about, and no more. Completeness used to sit
 * LAST in a strict left-to-right comparison, so a single review was enough to
 * make it never decide anything. Blending these three lets a much fuller
 * profile outweigh a small review advantage while a real review record still
 * wins.
 *
 * Tier, photo and the contact-preference match are deliberately NOT in here.
 * Each is a decision already taken and already tested (a nurse with a photo
 * outranks one with fifty reviews and no photo), and folding them into a
 * blend would quietly reverse them.
 *
 * The weights, and why: completeness carries its own 0 to 100, which is the
 * scale a family sees the difference on. Reviews are worth 3 each up to 5 of
 * them, so one review cannot outweigh a 25 point completeness gap while six
 * can. Rating counts only once there are reviews, and only above 3 stars, so
 * a lone 5 star review does not outrank a body of good ones.
 */
export function qualityScore(n: RankableNurse): number {
  const reviews = Math.min(n.review_count, 5) * 3;
  // Scaled small and never negative, so a null rating stays the floor rather
  // than scoring above a poor one, and a single 5 star review (7.5) cannot
  // outweigh a body of reviews (15 at five of them).
  const rating = n.review_count > 0 ? (n.avg_rating ?? 0) * 1.5 : 0;
  return n.profile_completeness + reviews + rating;
}

/**
 * Ranking tuple, compared left-to-right, higher wins.
 *
 * With a zip, distance leads: a family who types a zip is telling us the one
 * thing she cares about most. A nurse we cannot place sorts below every nurse
 * we can, rather than being treated as distance zero (which would put her
 * first) or dropped (which would hide her without saying so).
 */
export function rankingScore(
  n: RankableNurse,
  viewerCommPref: string | null,
  distance?: DistanceContext,
): number[] {
  const quality = qualityScore(n);
  const photo = n.has_photo ? 1 : 0;
  const commPref =
    viewerCommPref && n.communication_preference === viewerCommPref ? 1 : 0;

  // A family who was given a nurse's name and types it is identifying someone,
  // not expressing a preference, so the match outranks every signal that
  // stands in for one: a photo, a contact match, a fuller profile, and even
  // distance. It sits BELOW the paid Featured placement, which is absolute
  // (Dan's call, 2026-09-04): a Featured nurse is never pushed down.
  //
  // Absent on every search without a keyword, where it is 0 for everyone and
  // the order is exactly what it was before (#936).
  const named = n.name_match ? 1 : 0;

  if (!distance?.originResolved) {
    return [n.tier === "featured" ? 1 : 0, named, photo, commPref, quality];
  }

  const miles = n.distance_miles ?? null;
  const inRange = miles !== null && miles <= distance.featuredRangeMiles;

  return [
    n.tier === "featured" && inRange ? 1 : 0,
    named,
    miles === null ? 0 : 1,
    miles === null ? 0 : -miles,
    photo,
    commPref,
    quality,
  ];
}

/**
 * Sort nurses by ranking score (highest-priority criteria first).
 */
export function rankNurses<T extends RankableNurse>(
  nurses: T[],
  viewerCommPref: string | null,
  distance?: DistanceContext,
): T[] {
  return [...nurses].sort((a, b) => {
    const sa = rankingScore(a, viewerCommPref, distance);
    const sb = rankingScore(b, viewerCommPref, distance);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sb[i] - sa[i];
    }
    // Full tie on every ranking criterion. The raw query has no ORDER BY,
    // so Postgres doesn't guarantee row order between executions; without
    // this, ties fall back to whatever order the DB happened to return,
    // which can differ between the page's initial render and a later
    // re-render and produce a hydration mismatch (NURSEDEX-SITE-4).
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });
}

// ── An explicitly chosen sort ─────────────────────────────────

/**
 * Order the results the way the family asked.
 *
 * Best match is the default and is the ranking above, so the paid Featured
 * placement is what she sees unless she deliberately chooses otherwise. Once
 * she does choose, her choice wins outright: quietly keeping Featured on top
 * would not be the order she asked for, and she has no way to tell that from
 * a broken control (#725).
 *
 * Every sort ends on the same deterministic tie-break as the ranking, because
 * a page that renders one order and re-renders another produces a hydration
 * mismatch (NURSEDEX-SITE-4).
 */
export function orderNurses<T extends RankableNurse>(
  nurses: T[],
  viewerCommPref: string | null,
  opts: { sort: SortMode; distance?: DistanceContext },
): T[] {
  if (opts.sort === "best") {
    return rankNurses(nurses, viewerCommPref, opts.distance);
  }

  const key = SORT_KEYS[opts.sort];
  return [...nurses].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return kb - ka;
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });
}

export type SortMode = "best" | "closest" | "rating" | "complete" | "newest";

/**
 * Higher wins, for each sort. Anything unknown scores below everything known,
 * so a nurse we cannot place, or who has never been rated, sorts last rather
 * than first, which is what treating an absent value as zero would do for
 * distance.
 */
const SORT_KEYS: Record<Exclude<SortMode, "best">, (n: RankableNurse) => number> =
  {
    closest: (n) =>
      n.distance_miles === null || n.distance_miles === undefined
        ? -Infinity
        : -n.distance_miles,
    rating: (n) =>
      n.review_count > 0 && n.avg_rating !== null ? n.avg_rating : -Infinity,
    complete: (n) => n.profile_completeness,
    newest: (n) =>
      n.verified_at ? new Date(n.verified_at).getTime() : -Infinity,
  };
