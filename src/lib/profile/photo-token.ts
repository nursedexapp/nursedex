import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

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
 * reintroduce the exact bug this exists to fix. The IV is derived from the
 * plaintext (the standard synthetic IV construction) rather than fixed, so the
 * same path always yields the same token without ever reusing an IV across
 * different plaintexts.
 *
 * Keyed by separate derivations of SUPABASE_SECRET_KEY rather than a new
 * secret: it is server only, already present in every environment, and key
 * separation by label means this use cannot weaken its primary one.
 */

const ENC_LABEL = "nurse-photo-token/enc/v1";
const IV_LABEL = "nurse-photo-token/iv/v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function rootKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is required to address nurse photos. Refusing to build a photo URL that cannot be verified.",
    );
  }
  return key;
}

function derive(label: string, root: string): Buffer {
  return createHmac("sha256", root).update(label).digest();
}

/** The address a card points at. Same path in, same token out, always. */
export function encodePhotoToken(path: string): string {
  const root = rootKey();
  const iv = createHmac("sha256", derive(IV_LABEL, root))
    .update(path)
    .digest()
    .subarray(0, IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", derive(ENC_LABEL, root), iv);
  const body = Buffer.concat([cipher.update(path, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * The storage path this token stands for, or null if it does not stand for
 * one. Null rather than a throw: every rejection here is a request from
 * outside, answered with a 400, and a throw would make that a 500.
 */
export function decodePhotoToken(token: string): string | null {
  let root: string;
  try {
    root = rootKey();
  } catch {
    return null;
  }
  if (!token) return null;

  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(
      "aes-256-gcm",
      derive(ENC_LABEL, root),
      iv,
    );
    decipher.setAuthTag(tag);
    const path = Buffer.concat([
      decipher.update(body),
      decipher.final(),
    ]).toString("utf8");

    // GCM authenticates the ciphertext, not the IV we were handed. Without
    // this, a token could carry a valid body under an attacker-chosen IV.
    // Re-deriving from the recovered path is what ties the two together.
    const expectedIv = createHmac("sha256", derive(IV_LABEL, root))
      .update(path)
      .digest()
      .subarray(0, IV_BYTES);
    if (!timingSafeEqual(iv, expectedIv)) return null;

    return path;
  } catch {
    return null;
  }
}
