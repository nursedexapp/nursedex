import {
  openToken,
  sealToken,
  type SealLabels,
} from "@/lib/security/sealed-token";

/**
 * Opaque, stable, unforgeable address for one stored nurse photo (#871).
 *
 * `/api/nurse-photo` needs the storage path in order to sign it. Two
 * constraints decide the shape of this:
 *
 * 1. It must be derivable from the URL ALONE, with no database lookup. The
 *    first version resolved a (nurse id, photo id) pair against the database on
 *    every request, and a page of fifteen nurses makes fifteen concurrent
 *    optimizer requests: measured on the preview, six of them failed and the
 *    visitor lost those photos entirely. A lookup on this path does not scale
 *    with the fan-out that a single page load produces.
 * 2. The raw path must not reach the browser, which `toPublicNurseCard` and
 *    the guard in saves.test.ts already enforce for the card. A URL is markup
 *    like anything else, so signing the path is not enough: it is encrypted.
 *
 * Deterministic by construction, because a token that varied per render would
 * reintroduce the exact bug this exists to fix. The construction (AES-GCM
 * with a synthetic IV, keyed from SUPABASE_SECRET_KEY by label) lives in
 * src/lib/security/sealed-token.ts, shared with blog video previews; these
 * labels keep photo tokens apart from every other use. Changing them would
 * invalidate every photo URL already cached.
 */

const LABELS: SealLabels = {
  enc: "nurse-photo-token/enc/v1",
  iv: "nurse-photo-token/iv/v1",
  purpose: "nurse photos",
};

/** The address a card points at. Same path in, same token out, always. */
export function encodePhotoToken(path: string): string {
  return sealToken(path, LABELS);
}

/**
 * The storage path this token stands for, or null if it does not stand for
 * one. Null rather than a throw: every rejection here is a request from
 * outside, answered with a 400, and a throw would make that a 500.
 */
export function decodePhotoToken(token: string): string | null {
  return openToken(token, LABELS);
}
