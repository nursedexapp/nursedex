import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate a URL-safe slug from a nurse's name and credential.
 * Format: first-last-credential (e.g. "jane-doe-rn")
 * Appends a numeric suffix on collision (e.g. "jane-doe-rn-2")
 */
export async function generateSlug(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
  credential: string,
  excludeUserId?: string,
): Promise<string> {
  const base = `${firstName}-${lastName}-${credential}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Check if base slug is available
  let candidate = base;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase
      .from("nurse_profiles")
      .select("id")
      .eq("slug", candidate);

    if (excludeUserId) {
      query = query.neq("user_id", excludeUserId);
    }

    const { data } = await query.single();

    if (!data) {
      // Also check slug_redirects to avoid conflicts with old slugs
      const { data: redirect } = await supabase
        .from("slug_redirects")
        .select("id")
        .eq("old_slug", candidate)
        .single();

      if (!redirect) break;
    }

    candidate = `${base}-${suffix}`;
    suffix++;
  }

  return candidate;
}

/**
 * Save a slug redirect when a nurse's slug changes.
 * This ensures old profile URLs still work.
 */
export async function saveSlugRedirect(
  supabase: SupabaseClient,
  oldSlug: string,
  newSlug: string,
  nurseUserId: string,
): Promise<void> {
  if (oldSlug === newSlug) return;

  await supabase.from("slug_redirects").upsert(
    {
      old_slug: oldSlug,
      new_slug: newSlug,
      nurse_user_id: nurseUserId,
    },
    { onConflict: "old_slug" },
  );
}
