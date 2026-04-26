export interface RankableNurse {
  tier: "free" | "featured";
  has_photo: boolean;
  communication_preference: string | null;
  review_count: number;
  avg_rating: number | null;
  profile_completeness: number;
}

/**
 * Ranking tuple, compared left-to-right. Higher number wins.
 *
 * 1. Featured tier
 * 2. Has photo
 * 3. Comm preference match (if viewer has one)
 * 4. Review count
 * 5. Avg rating (0 if null)
 * 6. Profile completeness
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
    return 0;
  });
}
