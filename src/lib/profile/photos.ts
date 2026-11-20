import { encodePhotoToken } from "./photo-token";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PHOTO_UPLOAD } from "@/lib/constants";

import { reportDbFailure, toTypedFailure } from "@/lib/db/results";
import { isRetryableStatus, retryingOnce } from "@/lib/http/retry-once";
import { reportAbsorbedRetry } from "@/lib/sentry/absorbed-retry";
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
 * The stable address of the photo a card or a public profile shows: the
 * nurse's first. Null when she has none.
 *
 * Minting the address needs the server key. Losing a photo is bad; throwing
 * here would answer a whole page with a 500 for every visitor, so the page
 * falls back to its no-photo state. Logged, because that state is
 * indistinguishable on screen from a nurse who never uploaded one, and a
 * misconfigured deploy would otherwise read as an onboarding gap.
 */
export function firstNursePhotoUrl(photos: string[]): string | null {
  if (photos.length === 0) return null;
  try {
    return nursePhotoUrl(photos[0]);
  } catch (e) {
    console.error(
      `Could not build a photo URL for ${photos[0]}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

const SIGNING = "a signed URL for a nurse's photo";

// The wait before the one retry. A visitor is waiting on this call, so it is a
// fraction of a second where the helper's own default is the two seconds a
// cron job can spare. The spread is for the directory: its fifteen photos are
// signed by fifteen concurrent requests, and refusals that arrived together
// would otherwise all ask again in the same instant.
const SIGN_RETRY_BASE_MS = 300;
const SIGN_RETRY_SPREAD_MS = 300;

export type SignPhotoDeps = {
  /** Injected so tests never wait for real (L524). */
  sleep?: (ms: number) => Promise<void>;
  /** A number in [0, 1), as Math.random gives. Injected so the wait is exact in tests. */
  random?: () => number;
};

/**
 * Get a signed URL to display a nurse photo.
 * Returns null if the photo cannot be signed.
 *
 * Uses the service-role client because the nurse-photos bucket is
 * private and anon callers can't sign their own URLs. The resulting
 * signed URL is short-lived. It is never put in a page a visitor reads:
 * those use `nursePhotoUrl`, and photos.test.ts lists who may call this.
 *
 * Storage is asked once more after a 429 or a 5xx (#1321). On 2026-11-19 and
 * again on 2026-11-20 it answered one call with 544, "The connection to the
 * database timed out", while every call around it succeeded
 * (NURSEDEX-SITE-1E). Each cost a visitor a photo and posted an alert nobody
 * could act on. An absorbed refusal is counted; a second one is the error.
 */
export async function getSignedPhotoUrl(
  path: string,
  deps: SignPhotoDeps = {},
): Promise<string | null> {
  if (!path) return null;
  const { sleep, random = Math.random } = deps;

  const supabase = createServiceRoleClient();

  const { data, error } = await retryingOnce(
    () =>
      supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, PHOTO_UPLOAD.SIGNED_URL_TTL_SECONDS),
    {
      // An error with no status is one supabase-js could not read, so nothing
      // says the next call would go differently.
      isRetryable: ({ error }) =>
        typeof error?.status === "number" && isRetryableStatus(error.status),
      delayMs: () =>
        SIGN_RETRY_BASE_MS + Math.floor(random() * SIGN_RETRY_SPREAD_MS),
      sleep,
      onRetry: ({ error }) =>
        reportAbsorbedRetry(
          `Supabase Storage refused a photo signing call with ${error?.status}, retrying once`,
          { db_operation: SIGNING },
        ),
    },
  );

  // The null stays: every caller treats it as "no preview yet" and re-signs on
  // the next render, so throwing would fail a whole profile over one image.
  // What was missing is that the console was the only place this went (#1000).
  if (error) {
    reportDbFailure(SIGNING, error);
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
  return Promise.all(paths.map((path) => getSignedPhotoUrl(path)));
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
