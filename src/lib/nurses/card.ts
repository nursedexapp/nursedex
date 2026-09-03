import { nursePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";

/**
 * One shaper for the nurse card, shared by every producer of it.
 *
 * The card object used to be built by hand in three places (search, saved
 * nurses, revealed nurses). There was nowhere its completeness could be seen,
 * which is how the #381 identity fix landed in one producer and was missed in
 * the other two (#770). Everything about the card now lives here: the columns
 * it needs, the keys it requires back, the mapping, and the identity gate.
 */

// ── The card ──────────────────────────────────────────────────

/** Card exposed to UI components. */
export interface NurseSearchCard {
  user_id: string;
  slug: string;
  first_name: string;
  last_name: string;
  credential: string;
  primary_care_type: string | null;
  care_types: string[];
  tier: "free" | "featured";
  has_photo: boolean;
  photo_url: string | null;
  avg_rating: number | null;
  review_count: number;
  is_available: boolean;
  unavailable_visibility: string | null;
  profile_completeness: number;
  // When she was verified, for the newest-first sort (#725).
  verified_at: string | null;
  // Where her face is in the photo, 0-100 each, as CSS object-position (#768).
  photo_focal_x: number;
  photo_focal_y: number;
  zip_code: string | null;
  distance_miles: number | null;
  communication_preference: string | null;
  years_experience: number | null;
  /**
   * First letter of the surname, uppercased, or "" when there is none on
   * file. Shown to every viewer: it is the "Jane R." on the card. Distinct
   * from last_name, which is gated.
   */
  last_initial: string;
  /**
   * The nurse's own words. Null for a logged out visitor, and null for a
   * nurse who has written none. The card has to tell those apart, so nothing
   * downstream may treat null as "locked" (#774).
   */
  bio: string | null;
  rate_min: number | null;
  rate_max: number | null;
  availability_commitment: string[];
  /**
   * Whether this nurse has set a rate / an availability at all, regardless of
   * whether this viewer may see the value.
   *
   * The card's locked footer has to be derived from the nurse's own record
   * rather than asserted (#774). Without these, a card promising "log in to
   * see rate and availability" for a nurse who has set neither sends a family
   * to sign up and meet a blank. The flag says the fact exists; it is
   * deliberately not a way to recover the value.
   */
  has_rate: boolean;
  has_availability: boolean;
  /** Town and state, from the zip lookup. Null until that lookup runs. */
  city: string | null;
  state: string | null;
  // True when the viewing family has already revealed this nurse. Set by
  // searchNurses only when viewerRevealedIds is provided.
  revealed?: boolean;
}

/**
 * Card plus the raw storage paths needed to sign photo URLs. Never handed to a
 * client component: toPublicNurseCard strips it, because a client-component
 * prop ships in the RSC payload the browser downloads.
 */
export interface InternalNurseCard extends NurseSearchCard {
  photos: string[];
}

// ── Columns ───────────────────────────────────────────────────

/**
 * Profile columns the shaper reads. The runtime assertion below and the select
 * string are both derived from this list, so a column added to one cannot go
 * missing from the other.
 */
export const NURSE_CARD_ROW_KEYS = [
  "user_id",
  "slug",
  "credential",
  "primary_care_type",
  "care_types",
  "tier",
  "has_photo",
  "photos",
  "avg_rating",
  "review_count",
  "is_available",
  "unavailable_visibility",
  "profile_completeness",
  "verified_at",
  "photo_focal_x",
  "photo_focal_y",
  "years_experience",
  "bio",
  "rate_min",
  "rate_max",
  "availability_commitment",
] as const;

/** User columns the shaper reads, off the `users!inner` embed. */
export const NURSE_CARD_USER_KEYS = [
  "first_name",
  "last_name",
  "zip_code",
  "communication_preference",
] as const;

/**
 * The one PostgREST select string for a nurse card.
 *
 * `is_deleted` and `is_suspended` are not read by the shaper: they are there
 * for applyVisibleNurseFilter, which needs them embedded to filter on them.
 * `verification_status` likewise, filtered on rather than read.
 */
export const NURSE_CARD_COLUMNS = `
      ${NURSE_CARD_ROW_KEYS.join(",\n      ")},
      verification_status,
      users!inner (
        ${NURSE_CARD_USER_KEYS.join(",\n        ")},
        is_deleted,
        is_suspended
      )
    `;

// ── Shaping ───────────────────────────────────────────────────

interface ShapeOptions {
  /**
   * Whether the viewer may see nurse identity (last name). No default: a
   * producer has to state which viewer it is shaping for, so forgetting shows
   * up as a type error rather than as a leak or a blank name.
   */
  canSeeIdentity: boolean;
  /**
   * Whether the viewer may see the nurse's bio, rate and availability
   * (decision D1: signed in, of any role). Also no default. A default of
   * false would show "Log in to see rate and availability" to a paying family
   * on their own dashboard; a default of true would ship a nurse's rate to
   * every logged out visitor.
   */
  canSeeDetails: boolean;
}

/**
 * Shape one PostgREST row into a card, gating identity as it goes.
 *
 * Throws when the row is missing a column the card promises. The select string
 * is a string literal and every producer casts its result, so without this a
 * dropped column arrives as undefined and the compiler reports nothing (#771).
 * A missing column is a programming error, so it is loud; a null value is a
 * legitimate value and passes.
 */
export function shapeNurseCard(
  row: unknown,
  { canSeeIdentity, canSeeDetails }: ShapeOptions,
): InternalNurseCard {
  const r = assertNurseCardRow(row);
  const u = r.users;
  const lastName = (u.last_name as string | null) ?? "";

  return {
    user_id: r.user_id as string,
    slug: r.slug as string,
    first_name: (u.first_name as string | null) ?? "",
    // #381 / #770: gated here, in the data, so no producer can ship the raw
    // value by forgetting a presentational prop.
    last_name: canSeeIdentity ? lastName : "",
    last_initial: lastInitial(lastName),
    credential: r.credential as string,
    primary_care_type: r.primary_care_type as string | null,
    care_types: (r.care_types as string[] | null) ?? [],
    tier: r.tier as "free" | "featured",
    has_photo: r.has_photo as boolean,
    photo_url: null,
    avg_rating: r.avg_rating as number | null,
    review_count: r.review_count as number,
    is_available: r.is_available as boolean,
    unavailable_visibility: r.unavailable_visibility as string | null,
    profile_completeness: r.profile_completeness as number,
    verified_at: (r.verified_at as string | null) ?? null,
    photo_focal_x: r.photo_focal_x as number,
    photo_focal_y: r.photo_focal_y as number,
    zip_code: u.zip_code as string | null,
    distance_miles: null,
    communication_preference: u.communication_preference as string | null,
    years_experience: r.years_experience as number | null,
    // #773 decision D1. Blanked in the data, not hidden in markup.
    bio: canSeeDetails
      ? clampBio((r.bio as string | null) || null, r.tier as string)
      : null,
    rate_min: canSeeDetails ? numericOrNull(r.rate_min, "rate_min") : null,
    rate_max: canSeeDetails ? numericOrNull(r.rate_max, "rate_max") : null,
    availability_commitment: canSeeDetails
      ? ((r.availability_commitment as string[] | null) ?? [])
      : [],
    has_rate: r.rate_min !== null || r.rate_max !== null,
    has_availability:
      ((r.availability_commitment as string[] | null) ?? []).length > 0,
    // Filled in by attachNurseCardTowns, which needs a second query.
    city: null,
    state: null,
    photos: (r.photos as string[] | null) ?? [],
  };
}

/**
 * How much bio the card carries, by tier (decision D9).
 *
 * A single cap would cut the paid tier off on the page families actually
 * browse. Applied in the data rather than only in CSS, so a free nurse's card
 * does not ship 500 characters the browser will never draw.
 */
export const BIO_CAP_BY_TIER: Record<string, number> = {
  free: 150,
  featured: 500,
};

export function clampBio(bio: string | null, tier: string): string | null {
  if (!bio) return null;
  const cap = BIO_CAP_BY_TIER[tier] ?? BIO_CAP_BY_TIER.free;
  const trimmed = bio.trim();
  if (trimmed.length <= cap) return trimmed;
  // Cut on a word boundary so the last word is not sliced in half.
  const cut = trimmed.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > cap * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}\u2026`;
}

/**
 * First letter of a surname, uppercased. One helper, called by the one shaper,
 * so every surface shows the same thing.
 */
export function lastInitial(lastName: string): string {
  return lastName.trim().charAt(0).toUpperCase();
}

/**
 * A numeric column as a number, or null.
 *
 * PostgREST can hand a `numeric` column back as a string depending on the
 * client and the column's scale. A string flows straight into a comparison as
 * false against every threshold and renders as "32.00", so it is coerced here
 * and refused if it will not coerce, rather than being shown wrong.
 */
function numericOrNull(value: unknown, column: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`nurse card ${column} is not a finite number: ${value}`);
    }
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`nurse card ${column} is not numeric: ${value}`);
    }
    return parsed;
  }
  throw new Error(
    `nurse card ${column} has an unreadable type: ${typeof value}`,
  );
}

/**
 * Shape a list of rows, dropping any whose `users` embed came back null.
 *
 * A null embed means the join matched nothing, i.e. the nurse is not publicly
 * visible. That is a real absence rather than a malformed row, so it is
 * dropped. A missing column still throws.
 */
export function shapeNurseCards(
  rows: unknown[],
  options: ShapeOptions,
): InternalNurseCard[] {
  return rows
    .filter((row) => (row as { users?: unknown } | null)?.users !== null)
    .map((row) => shapeNurseCard(row, options));
}

type CardRow = Record<string, unknown> & { users: Record<string, unknown> };

function assertNurseCardRow(row: unknown): CardRow {
  if (typeof row !== "object" || row === null) {
    throw new Error(`nurse card row is not an object (got ${typeof row})`);
  }
  const r = row as Record<string, unknown>;

  const missing = NURSE_CARD_ROW_KEYS.filter((key) => !(key in r));
  if (missing.length > 0) {
    throw new Error(
      `nurse card row is missing column(s): ${missing.join(", ")}. ` +
        `Every producer must select NURSE_CARD_COLUMNS.`,
    );
  }

  // Distinct cause, distinct message: an absent embed is a broken query, a
  // null embed is a nurse the visibility filter excluded, and a present embed
  // missing a field is a shortened select string.
  if (!("users" in r)) {
    throw new Error(
      "nurse card row has no users embed. Every producer must select " +
        "NURSE_CARD_COLUMNS, which embeds users!inner.",
    );
  }
  const users = r.users;
  if (typeof users !== "object" || users === null) {
    throw new Error(
      "nurse card row has a null users embed. Filter those rows out with " +
        "shapeNurseCards rather than shaping them.",
    );
  }

  const missingUser = NURSE_CARD_USER_KEYS.filter(
    (key) => !(key in (users as Record<string, unknown>)),
  );
  if (missingUser.length > 0) {
    throw new Error(
      `nurse card row is missing user column(s): ${missingUser.join(", ")}. ` +
        `Every producer must select NURSE_CARD_COLUMNS.`,
    );
  }

  return { ...r, users: users as Record<string, unknown> } as CardRow;
}

/** Strip the internal fields before the card becomes a client-component prop. */
export function toPublicNurseCard(card: InternalNurseCard): NurseSearchCard {
  const { photos: _photos, ...rest } = card;
  return rest;
}

// ── Photos ────────────────────────────────────────────────────

/**
 * Point every card that has a photo at the stable photo route (#871).
 *
 * This used to sign each photo here, which put a freshly minted token in the
 * markup and made the URL different on every render. That is a new cache key
 * every time, so Vercel's image optimizer never once hit its cache and
 * re-encoded every photo on every visit. `nursePhotoUrl` is stable while the
 * photo is, and `/api/nurse-photo` signs it once behind the cache.
 *
 * No Supabase call happens here any more, so a page of 15 nurses no longer
 * makes 15 signing round trips before it can stream. A photo that cannot be
 * served fails at the route, which is where it is now reported.
 */
export async function attachNurseCardPhotos(
  cards: InternalNurseCard[],
): Promise<void> {
  await Promise.all(
    cards.map(async (card) => {
      if (card.photos.length === 0) return;
      try {
        card.photo_url = nursePhotoUrl(card.photos[0]);
      } catch (e) {
        // Minting the address needs the server key. Losing a photo is bad;
        // throwing here would take the whole directory down with a 500 for
        // every visitor, so the card falls back to its no-photo state exactly
        // as it did when a signing failure happened here. Logged, because that
        // state is indistinguishable on screen from a nurse who never uploaded
        // one, and a misconfigured deploy would otherwise read as an
        // onboarding gap.
        card.photo_url = null;
        console.error(
          `Could not build a photo URL for ${card.photos[0]}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );
}

// ── Towns ─────────────────────────────────────────────────────

/**
 * Ceiling on how many zips one request may look up.
 *
 * A search enriches every row it fetched, and that fetch is itself capped at
 * 500 rows, so the distinct zip count per request is at most 500 plus the
 * origin. In practice it is far lower, because nurses cluster in a handful of
 * towns. The cap is here so the `.in()` list can never grow without anybody
 * noticing, and a truncation says so rather than silently dropping towns.
 */
export const ZIP_LOOKUP_CAP = 500;

export interface ZipRecord {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

/**
 * Look up zip rows by zip. One query, one shape, shared by the town lookup on
 * every producer and by search's distance calculation, so a page never runs
 * the same lookup twice.
 *
 * Returns an empty map on a failed read, and logs. A caller cannot tell a
 * failed lookup from a set of zips we hold nothing for, and neither can the
 * card: both leave the town blank, which is a designed state.
 */
export async function lookupZips(
  zips: string[],
): Promise<Map<string, ZipRecord>> {
  const distinct = Array.from(new Set(zips.filter((z) => !!z)));
  if (distinct.length === 0) return new Map();

  const capped = distinct.slice(0, ZIP_LOOKUP_CAP);
  if (capped.length < distinct.length) {
    console.error(
      `zip lookup capped at ${ZIP_LOOKUP_CAP}; ${distinct.length - capped.length} zip(s) not looked up`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zip_codes")
    .select("zip, city, state, latitude, longitude")
    .in("zip", capped);

  if (error) {
    console.error("zip_codes lookup failed:", error.message);
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.zip as string,
      {
        city: row.city as string,
        state: row.state as string,
        latitude: row.latitude as number,
        longitude: row.longitude as number,
      },
    ]),
  );
}

/** Write the town onto each card from an already-fetched zip lookup. */
export function applyTowns(
  cards: InternalNurseCard[],
  zipRows: Map<string, ZipRecord>,
): void {
  for (const card of cards) {
    if (!card.zip_code) continue;
    const row = zipRows.get(card.zip_code);
    if (!row) continue;
    card.city = row.city;
    card.state = row.state;
  }
}

/**
 * Fill in the town on every card. For producers that need no distance and so
 * have no zip lookup of their own.
 */
export async function attachNurseCardTowns(
  cards: InternalNurseCard[],
): Promise<void> {
  if (cards.length === 0) return;
  const rows = await lookupZips(
    cards.map((c) => c.zip_code).filter((z): z is string => !!z),
  );
  applyTowns(cards, rows);
}
