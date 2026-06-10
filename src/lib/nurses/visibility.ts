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
  // bound to the (very deep) Supabase builder type — the latter trips
  // "Type instantiation is excessively deep" (TS2589) on some call sites.
  type Chainable = { eq(column: string, value: unknown): Chainable };
  return (query as unknown as Chainable)
    .eq("verification_status", "verified")
    .eq("is_hidden", false)
    .eq("users.is_deleted", false)
    .eq("users.is_suspended", false) as unknown as T;
}
