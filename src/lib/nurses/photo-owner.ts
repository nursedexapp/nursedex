import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { nursePhotoId } from "@/lib/profile/photos";

/**
 * Resolve a (nurse id, photo id) pair back to the storage path it stands for,
 * or null when the public may not see it (#871).
 *
 * `/api/nurse-photo` is unauthenticated, because nurse photos are public on the
 * directory (decision, 1 September 2026, #873). Unauthenticated is not the same
 * as unscoped: the same filter every listing surface uses decides it here, so a
 * nurse hidden from search is hidden here by the same rule rather than a second
 * one that could drift from it. The photo id is a hash of the path, so a caller
 * cannot ask for a photo by naming a path, only by naming one this nurse
 * actually has.
 *
 * Fails CLOSED: any error answers null, because the alternative is serving a
 * photo we could not confirm anyone is allowed to see.
 */
export async function resolveVisibleNursePhoto(
  userId: string,
  photoId: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await applyVisibleNurseFilter(
    supabase
      .from("nurse_profiles")
      .select(
        "photos, verification_status, is_hidden, users!inner(is_deleted, is_suspended)",
      )
      .eq("user_id", userId),
  ).limit(1);

  if (error) {
    console.error(
      `Could not resolve nurse photo ${userId}/${photoId}:`,
      error.message,
    );
    return null;
  }

  const photos = (data?.[0]?.photos as string[] | undefined) ?? [];
  return photos.find((p) => nursePhotoId(p) === photoId) ?? null;
}
