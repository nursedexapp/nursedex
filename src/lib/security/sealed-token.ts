import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

/**
 * An unforgeable, deterministic token for a short string the server put in a
 * page, so a public route can serve exactly what the app rendered and nothing
 * a caller names (nurse photos #871, video previews L498).
 *
 * AES-256-GCM, so a token cannot be forged or altered, and the plaintext is
 * not readable in the URL. Deterministic by construction: the IV is derived
 * from the plaintext (the standard synthetic IV construction) rather than
 * fixed, so the same input always yields the same token, which keeps CDN and
 * image optimizer caches warm, without ever reusing an IV across different
 * plaintexts.
 *
 * Keyed by separate derivations of SUPABASE_SECRET_KEY rather than a new
 * secret: it is server only, already present in every environment, and key
 * separation by label means one use cannot weaken another, nor can a token
 * minted for one use open under another's labels.
 */

export interface SealLabels {
  /** Key derivation label for the cipher, unique to one use. */
  enc: string;
  /** Key derivation label for the synthetic IV, unique to one use. */
  iv: string;
  /** What the token addresses, for the missing key error. */
  purpose: string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function rootKey(purpose: string): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      `SUPABASE_SECRET_KEY is required to address ${purpose}. Refusing to build a URL that cannot be verified.`,
    );
  }
  return key;
}

function derive(label: string, root: string): Buffer {
  return createHmac("sha256", root).update(label).digest();
}

function syntheticIv(plaintext: string, labels: SealLabels, root: string) {
  return createHmac("sha256", derive(labels.iv, root))
    .update(plaintext)
    .digest()
    .subarray(0, IV_BYTES);
}

/** Same plaintext in, same token out, always. Throws without a key. */
export function sealToken(plaintext: string, labels: SealLabels): string {
  const root = rootKey(labels.purpose);
  const iv = syntheticIv(plaintext, labels, root);
  const cipher = createCipheriv("aes-256-gcm", derive(labels.enc, root), iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * The plaintext this token stands for, or null if it does not stand for one.
 * Null rather than a throw: every rejection here is a request from outside,
 * and a throw would make it a 500.
 */
export function openToken(token: string, labels: SealLabels): string | null {
  let root: string;
  try {
    root = rootKey(labels.purpose);
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
      derive(labels.enc, root),
      iv,
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(body),
      decipher.final(),
    ]).toString("utf8");

    // GCM authenticates the ciphertext, not the IV we were handed. Without
    // this, a token could carry a valid body under an attacker-chosen IV.
    // Re-deriving from the recovered plaintext is what ties the two together.
    if (!timingSafeEqual(iv, syntheticIv(plaintext, labels, root))) return null;

    return plaintext;
  } catch {
    return null;
  }
}
