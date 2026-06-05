import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Only surface a social-proof count once the waitlist is past this size.
const DISPLAY_THRESHOLD = 25;

/**
 * Display-ready waitlist count for the homepage, rounded down to the nearest
 * ten (or null when below the threshold). Cached for 5 minutes so the homepage
 * can render it server-side without hitting the database on every request.
 * Mirrors the logic the old GET /api/waitlist endpoint used.
 */
export const getWaitlistDisplayCount = unstable_cache(
  async (): Promise<number | null> => {
    try {
      const admin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
      );
      const { count } = await admin
        .from("waitlist")
        .select("*", { count: "exact", head: true });
      if (count === null || count < DISPLAY_THRESHOLD) return null;
      return Math.floor(count / 10) * 10;
    } catch {
      return null;
    }
  },
  ["waitlist-display-count"],
  { revalidate: 300 },
);
