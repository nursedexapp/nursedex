import { encodePhotoToken } from "./photo-token";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PHOTO_UPLOAD } from "@/lib/constants";

import { toTypedFailure } from "@/lib/db/results";
const BUCKET = "nurse-photos";

// Magic bytes for allowed image types
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header
};

/**
 * Generate a signed upload URL for a nurse photo.
 * The photo is stored in a private bucket under the nurse's user ID.
 */
export async function getSignedUploadUrl(
  userId: string,
  fileName: string,
): Promise<{ path: string; signedUrl: string } | { error: string }> {
  const supabase = await createClient();

  // Sanitize filename
  const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = `${Date.now()}.${ext}`;
  const path = `${userId}/${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("Signed upload URL error:", error.message);
    return { error: "Could not prepare photo upload. Please try again." };
  }

  return { path, signedUrl: data.signedUrl };
}

/**
 * The stable, cacheable URL a nurse photo is displayed through (#871).
 *
 * Never embed a signed URL in rendered markup: Supabase mints a fresh token on
 * every call, so the URL differs on every render, and Vercel's image optimizer
 * keys its cache on the source URL. In production that meant a cache MISS on
 * every photo request forever, re-fetching and re-encoding each photo on every
 * visit, and defeating the visitor's own browser cache too.
 *
 * The token is an encrypted form of the storage path, so `/api/nurse-photo`
 * can sign it with no lookup of its own. That matters: a page of fifteen
 * nurses produces fifteen concurrent optimizer requests, and an earlier
 * version that hit the database on each one lost six of the fifteen photos
 * under that fan-out. See photo-token.ts for why it is encrypted rather than
 * signed.
 */
export function nursePhotoUrl(path: string): string {
  return `/api/nurse-photo/${encodePhotoToken(path)}`;
}

/**
 * Get a signed URL to display a nurse photo.
 * Returns null if the photo cannot be signed.
 *
 * Uses the service-role client because the nurse-photos bucket is
 * private and anon callers can't sign their own URLs. The resulting
 * signed URL is short-lived and only ever embedded in server-rendered
 * markup that already gates which photos to surface.
 */
export async function getSignedPhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, PHOTO_UPLOAD.SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("Signed photo URL error:", error.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Get signed URLs for multiple photos at once.
 */
export async function getSignedPhotoUrls(
  paths: string[],
): Promise<(string | null)[]> {
  return Promise.all(paths.map(getSignedPhotoUrl));
}

/**
 * Validate that an uploaded file has correct magic bytes for its claimed type.
 * Call this after upload to verify the file is actually an image.
 */
export async function validateUploadedPhoto(
  path: string,
): Promise<{ valid: boolean; signedUrl?: string; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error || !data) {
    return { valid: false, error: "Could not read uploaded file" };
  }

  const buffer = new Uint8Array(await data.arrayBuffer());

  if (buffer.length > PHOTO_UPLOAD.MAX_SIZE_BYTES) {
    // Clean up oversized file. Checked: the row is rejected below, so an
    // unchecked failure leaves the object paid for and unreferenced in the
    // bucket forever, with nothing anywhere naming it (#847).
    await reportStorageRemoval(supabase, path, "an oversized upload");
    return { valid: false, error: "File exceeds the 5MB size limit" };
  }

  // Check magic bytes against all allowed types
  const isValid = Object.values(MAGIC_BYTES).some((magic) =>
    magic.every((byte, i) => buffer[i] === byte),
  );

  if (!isValid) {
    // Clean up invalid file, same as above.
    await reportStorageRemoval(
      supabase,
      path,
      "an upload that is not an image",
    );
    return {
      valid: false,
      error: "File is not a valid image (JPG, PNG, or WebP)",
    };
  }

  // Sign a short-lived display URL so the client can show the preview
  // immediately after upload without a second round trip. Falling back
  // to undefined here just delays the preview until the next render
  // that re-fetches photoUrls server-side.
  const signed = await getSignedPhotoUrl(path);
  return { valid: true, signedUrl: signed ?? undefined };
}

/**
 * Remove a photo from storage.
 */
export async function removePhoto(path: string): Promise<void> {
  const supabase = await createClient();
  await reportStorageRemoval(supabase, path, "a photo the nurse deleted");
}

/**
 * Remove one object from the photo bucket, and say so when it does not go.
 *
 * A storage `.remove()` resolves to `{ data, error }` exactly like a table
 * write, so all three call sites discarded a failure in silence (#847). The
 * OUTCOME stays the same at each of them: none can undo what has already
 * happened, and failing a nurse's photo deletion because the object survived
 * would leave them looking at a photo they asked to remove. What was missing
 * is the report, and an orphaned object in a paid bucket is exactly the kind
 * of cost nothing else would ever mention.
 */
async function reportStorageRemoval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
  what: string,
): Promise<void> {
  await toTypedFailure(
    supabase.storage.from(BUCKET).remove([path]),
    `the storage object behind ${what}`,
  );
}
