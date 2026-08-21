export interface RankableNurse {
  user_id: string;
  tier: "free" | "featured";
  has_photo: boolean;
  communication_preference: string | null;
  review_count: number;
  avg_rating: number | null;
  profile_completeness: number;
}

/**
 * The ranking criteria, in the order they are compared, in words.
 *
 * Anything that TELLS a family how results are ordered reads from here rather
 * than restating it, so a caption cannot claim an order the code does not use.
 * The mockup's "Most complete profiles first" was exactly that: completeness
 * is the LAST criterion, consulted only on an exact tie of everything above
 * it (#777).
 *
 * Entries marked conditional do not apply to every viewer, so a sentence built
 * for everyone may only use the unconditional ones.
 */
export const RANKING_CRITERIA = [
  { phrase: "featured nurses", conditional: false },
  { phrase: "nurses with a photo", conditional: false },
  { phrase: "a match on how you prefer to be contacted", conditional: true },
  { phrase: "more reviews", conditional: false },
  { phrase: "a higher rating", conditional: false },
  { phrase: "more complete profiles", conditional: false },
] as const;

/**
 * Ranking tuple, compared left-to-right. Higher number wins, in the order
 * RANKING_CRITERIA names.
 */
export function rankingScore(
  n: RankableNurse,
  viewerCommPref: string | null,
): number[] {
  return [
    n.tier === "featured" ? 1 : 0,
    n.has_photo ? 1 : 0,
    viewerCommPref && n.communication_preference === viewerCommPref ? 1 : 0,
    n.review_count,
    n.avg_rating ?? 0,
    n.profile_completeness,
  ];
}

/**
 * Sort nurses by ranking score (highest-priority criteria first).
 */
export function rankNurses<T extends RankableNurse>(
  nurses: T[],
  viewerCommPref: string | null,
): T[] {
  return [...nurses].sort((a, b) => {
    const sa = rankingScore(a, viewerCommPref);
    const sb = rankingScore(b, viewerCommPref);
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
