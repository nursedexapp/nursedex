import { LISTED_MINIMUM_CONTENT, UNLISTED_EMPTY_BIO } from "./listing";

/**
 * Single source of truth for the "publicly visible nurse" filter.
 *
 * A nurse profile is publicly visible only when it is verified, not hidden
 * (is_hidden, migration 041), and its owner is neither deleted nor suspended.
 * Most public read surfaces use the service-role client, which bypasses the
 * RLS policy that also enforces this, so the filter must be applied in the
 * query. Routing every such query through this helper keeps the four
 * conditions in one place so a new read surface can't silently forget one.
 *
 * The query MUST embed `users!inner( ..., is_deleted, is_suspended )` so the
 * owner-level conditions can be applied.
 */
export function applyVisibleNurseFilter<T>(query: T): T {
  // Chain through a fixed local builder type rather than a recursive generic
  // bound to the (very deep) Supabase builder type, the latter trips
  // "Type instantiation is excessively deep" (TS2589) on some call sites.
  type Chainable = { eq(column: string, value: unknown): Chainable };
  return (query as unknown as Chainable)
    .eq("verification_status", "verified")
    .eq("is_hidden", false)
    .eq("users.is_deleted", false)
    .eq("users.is_suspended", false) as unknown as T;
}


/**
 * Publicly visible AND worth showing: the filter for surfaces that DISCOVER a
 * nurse for somebody (the directory, the sitemap).
 *
 * Deliberately separate from applyVisibleNurseFilter rather than folded into
 * it. That filter is also how a family's SAVED nurses and the nurses she has
 * PAID to reveal are read; a minimum-content condition there would remove a
 * purchased result from the family who bought it. Direct profile links go
 * through their own RPC and are unaffected, so a nurse stays reachable by
 * anyone holding her link even while she is not listed.
 *
 * visibility.test.ts pins which surfaces use which, so a new caller has to
 * choose deliberately.
 */
export function applyListedNurseFilter<T>(query: T): T {
  type Chainable = { or(filter: string): Chainable };
  return (
    applyVisibleNurseFilter(query) as unknown as Chainable
  ).or(LISTED_MINIMUM_CONTENT) as unknown as T;
}

/**
 * Publicly visible but NOT listed: the verified nurses the directory does not
 * show, so they can be told (#732).
 *
 * The exact complement of applyListedNurseFilter over the same visible set.
 * Measured against production on 2026-09-03: 60 listed plus 40 unlisted out
 * of 100 visible, no overlap and no gap.
 */
export function applyUnlistedNurseFilter<T>(query: T): T {
  type Chainable = {
    eq(column: string, value: unknown): Chainable;
    or(filter: string): Chainable;
  };
  return (applyVisibleNurseFilter(query) as unknown as Chainable)
    .eq("has_photo", false)
    .or(UNLISTED_EMPTY_BIO) as unknown as T;
}
