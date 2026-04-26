import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SearchFilters } from "./search-params";

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
    await supabase.from("search_gap_log").insert({
      filters: serializeFilters(filters),
      result_count: resultCount,
    });
  } catch {
    // intentionally swallow - logging never blocks the page
  }
}

function serializeFilters(filters: SearchFilters): Record<string, unknown> {
  const { page: _page, ...rest } = filters;
  return rest;
}
