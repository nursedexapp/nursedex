import { getSignedPhotoUrl } from "@/lib/profile/photos";

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
  zip_code: string | null;
  distance_miles: number | null;
  communication_preference: string | null;
  years_experience: number | null;
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
  "years_experience",
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
  { canSeeIdentity }: ShapeOptions,
): InternalNurseCard {
  const r = assertNurseCardRow(row);
  const u = r.users;

  return {
    user_id: r.user_id as string,
    slug: r.slug as string,
    first_name: (u.first_name as string | null) ?? "",
    // #381 / #770: gated here, in the data, so no producer can ship the raw
    // value by forgetting a presentational prop.
    last_name: canSeeIdentity ? ((u.last_name as string | null) ?? "") : "",
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
    zip_code: u.zip_code as string | null,
    distance_miles: null,
    communication_preference: u.communication_preference as string | null,
    years_experience: r.years_experience as number | null,
    photos: (r.photos as string[] | null) ?? [],
  };
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
 * Sign the first photo of every card that has one, in parallel.
 *
 * A signing failure leaves photo_url null so the card still renders its
 * no-photo state; it is not a reason to drop the nurse.
 */
export async function attachNurseCardPhotos(
  cards: InternalNurseCard[],
): Promise<void> {
  await Promise.all(
    cards.map(async (card) => {
      if (card.photos.length === 0) return;
      try {
        card.photo_url = await getSignedPhotoUrl(card.photos[0]);
      } catch {
        card.photo_url = null;
      }
    }),
  );
}
