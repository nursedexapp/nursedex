import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PHOTO_UPLOAD } from "@/lib/constants";

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
 * Short, stable, non-reversible id for one stored photo.
 *
 * Keyed on the storage path, so it is the same for as long as the photo is and
 * different the moment the nurse uploads a new one. Deliberately not the path
 * itself: the raw storage path must never ship to the browser (see
 * `toPublicNurseCard`, and the guard in saves.test.ts), and a URL is markup.
 */
export function nursePhotoId(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
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
 * The nurse's id is already on the card, and the photo id is a hash, so this
 * reveals nothing the browser did not already have. `/api/nurse-photo` resolves
 * the pair back to a path and signs it, once, behind the cache.
 */
export function nursePhotoUrl(userId: string, path: string): string {
  return `/api/nurse-photo/${encodeURIComponent(userId)}/${nursePhotoId(path)}`;
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
    // Clean up oversized file
    await supabase.storage.from(BUCKET).remove([path]);
    return { valid: false, error: "File exceeds the 5MB size limit" };
  }

  // Check magic bytes against all allowed types
  const isValid = Object.values(MAGIC_BYTES).some((magic) =>
    magic.every((byte, i) => buffer[i] === byte),
  );

  if (!isValid) {
    // Clean up invalid file
    await supabase.storage.from(BUCKET).remove([path]);
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
  await supabase.storage.from(BUCKET).remove([path]);
}
