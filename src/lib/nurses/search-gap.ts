import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SearchFilters } from "./search-params";

import { toTypedFailure } from "@/lib/db/results";
/**
 * Fire-and-forget log of low-result searches so we can spot care-type gaps
 * ("families keep searching for X and we have nobody"). Never blocks render.
 */
export async function logSearchGap(
  filters: SearchFilters,
  resultCount: number,
): Promise<void> {
  try {
    const supabase = await createClient();
    // Reported, not thrown. This row exists so somebody can later notice that
    // families keep searching for a care type nobody offers, and the whole
    // function is wrapped in a try/catch because logging must never block a
    // search. But a write that silently never lands makes that log
    // permanently incomplete while looking healthy, and the gap it is meant to
    // reveal is exactly what an incomplete log hides (#847).
    await toTypedFailure(
      supabase.from("search_gap_log").insert({
        filters: serializeFilters(filters),
        result_count: resultCount,
      }),
      "the search gap log entry",
    );
  } catch {
    // intentionally swallow - logging never blocks the page
  }
}

function serializeFilters(filters: SearchFilters): Record<string, unknown> {
  const { page: _page, ...rest } = filters;
  return rest;
}
