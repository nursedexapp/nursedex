import type { SupabaseClient } from "@supabase/supabase-js";

import { unwrapOrThrow, assertNoWriteError } from "@/lib/db/results";
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

  while (true) {
    let query = supabase
      .from("nurse_profiles")
      .select("id")
      .eq("slug", candidate);

    if (excludeUserId) {
      query = query.neq("user_id", excludeUserId);
    }

    // maybeSingle: the common "slug is available" case returns zero rows, which
    // .single() reports as a PGRST116 error (noisy in the Supabase logs).
    const { data } = await query.maybeSingle();

    if (!data) {
      // Also check slug_redirects to avoid conflicts with old slugs
      // A failed read is NOT "no redirect claims this slug" (#847). Breaking
      // out on it hands back a candidate an old profile URL still points at,
      // so following that URL would land on a different nurse.
      const redirect = await unwrapOrThrow(
        supabase
          .from("slug_redirects")
          .select("id")
          .eq("old_slug", candidate)
          .maybeSingle(),
        "an existing redirect claiming this slug",
      );

      if (!redirect) break;
    }

    candidate = `${base}-${suffix}`;
    suffix++;
  }

  return candidate;
}

/**
 * Generate a unique slug and apply it, retrying on the rare race where another
 * profile claims the same slug between the uniqueness check and the write.
 *
 * `apply` performs the update with the candidate slug and returns the Supabase
 * error (or null on success). On a unique-violation (Postgres 23505) we
 * regenerate and retry: generateSlug, run with a service-role client, now sees
 * the conflicting row and picks the next numeric suffix. Any non-23505 error
 * stops immediately.
 *
 * Pass a service-role client so the uniqueness check sees ALL profiles,
 * including other nurses' pending (RLS-hidden) ones.
 */
export async function claimSlug(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
  credential: string,
  excludeUserId: string,
  apply: (slug: string) => Promise<{ code?: string; message?: string } | null>,
): Promise<{ slug?: string; error?: { code?: string; message?: string } }> {
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await generateSlug(
      supabase,
      firstName,
      lastName,
      credential,
      excludeUserId,
    );
    const error = await apply(slug);
    if (!error) return { slug };
    if (error.code !== "23505") return { error };
    lastError = error;
  }

  return {
    error: lastError ?? { message: "could not assign a unique profile link" },
  };
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

  // Checked: this row is the ONLY thing that keeps an old profile URL working
  // after a nurse's slug changes. Unchecked, every link anybody had already
  // shared silently becomes a 404 (#847).
  await assertNoWriteError(
    supabase.from("slug_redirects").upsert(
      {
        old_slug: oldSlug,
        new_slug: newSlug,
        nurse_user_id: nurseUserId,
      },
      { onConflict: "old_slug" },
    ),
    "the redirect from a nurse's old profile link",
  );
}
