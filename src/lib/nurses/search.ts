import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import { SEARCH } from "@/lib/constants";
import { GENDER_FILTER_ANY, type SearchFilters } from "./search-params";
import { rankNurses as rankNursesPure } from "./search-ranking";

// Cap raw SQL fetch to keep the in-app distance filter / ranking cheap.
// At launch scale this won't trigger. If it does, we surface it so we know
// to paginate in SQL instead.
const SQL_FETCH_CAP = 500;

// Show partials when fewer than this many full matches exist in total.
const PARTIAL_MATCHES_THRESHOLD = 10;

// Card exposed to UI components.
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

// Internal card carries the raw photos array we need to sign URLs.
// Stripped before handing results to UI.
interface InternalCard extends NurseSearchCard {
  photos: string[];
}

export interface SearchResult {
  items: NurseSearchCard[];
  partials: NurseSearchCard[];
  totalFull: number;
  page: number;
  totalPages: number;
  hitResultCap: boolean;
}

export interface SearchOptions {
  filters: SearchFilters;
  viewerZip?: string | null;
  viewerCommPref?: string | null;
  // Nurse user_ids the viewing family has already revealed. When set, those
  // cards are marked revealed and sorted below the un-revealed ones.
  viewerRevealedIds?: Set<string>;
}

// ── Public entry point ────────────────────────────────────────

export async function searchNurses(
  options: SearchOptions,
): Promise<SearchResult> {
  const { filters, viewerZip, viewerCommPref, viewerRevealedIds } = options;

  const fullRaw = await runQuery(filters);
  const fullWithDistance = await enrichWithDistance(fullRaw, viewerZip ?? null);
  const fullAfterDistance = applyDistanceFilter(fullWithDistance, filters);
  let fullRanked = rankCards(fullAfterDistance, viewerCommPref ?? null);

  // Mark nurses the family already revealed and sink them below the rest,
  // keeping the existing rank order (Featured first, etc.) within each group.
  if (viewerRevealedIds && viewerRevealedIds.size > 0) {
    for (const c of fullRanked) c.revealed = viewerRevealedIds.has(c.user_id);
    fullRanked = [
      ...fullRanked.filter((c) => !c.revealed),
      ...fullRanked.filter((c) => c.revealed),
    ];
  }

  const pageSize = SEARCH.RESULTS_PER_PAGE;
  const page = Math.max(1, filters.page);
  const totalFull = fullRanked.length;
  const totalPages = Math.max(1, Math.ceil(totalFull / pageSize));
  const items = fullRanked.slice((page - 1) * pageSize, page * pageSize);

  let partials: InternalCard[] = [];
  if (totalFull < PARTIAL_MATCHES_THRESHOLD && page === 1) {
    const slotsToFill = pageSize - items.length;
    if (slotsToFill > 0) {
      partials = await getPartialMatches({
        filters,
        viewerZip: viewerZip ?? null,
        viewerCommPref: viewerCommPref ?? null,
        excludeUserIds: items.map((n) => n.user_id),
        limit: slotsToFill,
      });
    }
  }

  if (viewerRevealedIds && viewerRevealedIds.size > 0) {
    for (const c of partials) c.revealed = viewerRevealedIds.has(c.user_id);
  }

  await Promise.all([attachPhotoUrls(items), attachPhotoUrls(partials)]);

  return {
    items: items.map(toPublicCard),
    partials: partials.map(toPublicCard),
    totalFull,
    page,
    totalPages,
    hitResultCap: fullRaw.length >= SQL_FETCH_CAP,
  };
}

function toPublicCard(card: InternalCard): NurseSearchCard {
  const { photos: _photos, ...rest } = card;
  return rest;
}

// ── Raw DB fetch ──────────────────────────────────────────────

type RawNurseRow = {
  user_id: string;
  slug: string;
  credential: string;
  primary_care_type: string | null;
  care_types: string[];
  tier: "free" | "featured";
  has_photo: boolean;
  photos: string[];
  avg_rating: number | null;
  review_count: number;
  is_available: boolean;
  unavailable_visibility: string | null;
  profile_completeness: number;
  years_experience: number | null;
  users: {
    first_name: string | null;
    last_name: string | null;
    zip_code: string | null;
    communication_preference: string | null;
  } | null;
};

interface QueryOptions {
  skipLocation?: boolean;
  skipAvailability?: boolean;
}

async function runQuery(
  filters: SearchFilters,
  opts: QueryOptions = {},
): Promise<InternalCard[]> {
  // Search joins nurse_profiles to users for first_name / last_name /
  // zip_code on the cards. RLS on users only exposes id = auth.uid()
  // rows, which would zero out the inner join for anon and family
  // viewers. We use the service-role client here because the search
  // result is public-by-design (only verified non-deleted, non-suspended
  // nurses are returned) and cards never render contact fields.
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      slug,
      credential,
      primary_care_type,
      care_types,
      tier,
      has_photo,
      photos,
      avg_rating,
      review_count,
      is_available,
      unavailable_visibility,
      profile_completeness,
      years_experience,
      users!inner (
        first_name,
        last_name,
        zip_code,
        communication_preference,
        is_deleted,
        is_suspended
      )
    `,
    )
    .eq("verification_status", "verified")
    .eq("is_hidden", false)
    .eq("users.is_deleted", false)
    .eq("users.is_suspended", false);

  // Availability visibility:
  // - unavailable_visibility='hidden' → NEVER in search.
  // - is_available=true → always included.
  // - is_available=false + 'badge' → only when show_unavailable=true
  //   (or when availability relaxation is in effect).
  if (opts.skipAvailability || filters.show_unavailable) {
    query = query.or(
      "is_available.eq.true,and(is_available.eq.false,unavailable_visibility.eq.badge)",
    );
  } else {
    query = query.eq("is_available", true);
  }

  // Scalar filters
  if (filters.credential) {
    query = query.eq("credential", filters.credential);
  }
  if (filters.care_type) {
    query = query.contains("care_types", [filters.care_type]);
  }
  if (filters.gender && filters.gender !== GENDER_FILTER_ANY) {
    query = query.eq("gender", filters.gender);
  }
  if (filters.experience_min !== undefined && filters.experience_min > 0) {
    query = query.gte("years_experience", filters.experience_min);
  }

  // Rate overlap:
  //   rate_max (user max budget) → nurse.rate_min must be ≤ user.rate_max (or null)
  //   rate_min (user min acceptable) → nurse.rate_max must be ≥ user.rate_min (or null)
  if (filters.rate_max !== undefined) {
    query = query.or(`rate_min.is.null,rate_min.lte.${filters.rate_max}`);
  }
  if (filters.rate_min !== undefined && filters.rate_min > 0) {
    query = query.or(`rate_max.is.null,rate_max.gte.${filters.rate_min}`);
  }

  if (filters.skills.length > 0) {
    query = query.overlaps("skills", filters.skills);
  }
  if (filters.languages.length > 0) {
    query = query.overlaps("languages", filters.languages);
  }
  if (!opts.skipAvailability) {
    if (filters.availability_commitment.length > 0) {
      query = query.overlaps(
        "availability_commitment",
        filters.availability_commitment,
      );
    }
    if (filters.time_slots.length > 0) {
      query = query.overlaps("time_slots", filters.time_slots);
    }
  }

  query = query.limit(SQL_FETCH_CAP);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as RawNurseRow[])
    .filter((row) => row.users !== null)
    .map(shapeRow);
}

function shapeRow(row: RawNurseRow): InternalCard {
  const users = row.users!;
  return {
    user_id: row.user_id,
    slug: row.slug,
    first_name: users.first_name ?? "",
    last_name: users.last_name ?? "",
    credential: row.credential,
    primary_care_type: row.primary_care_type,
    care_types: row.care_types,
    tier: row.tier,
    has_photo: row.has_photo,
    photo_url: null,
    avg_rating: row.avg_rating,
    review_count: row.review_count,
    is_available: row.is_available,
    unavailable_visibility: row.unavailable_visibility,
    profile_completeness: row.profile_completeness,
    zip_code: users.zip_code,
    distance_miles: null,
    communication_preference: users.communication_preference,
    years_experience: row.years_experience,
    photos: row.photos,
  };
}

// ── Distance ──────────────────────────────────────────────────

async function enrichWithDistance(
  nurses: InternalCard[],
  viewerZip: string | null,
): Promise<InternalCard[]> {
  if (!viewerZip || nurses.length === 0) return nurses;

  const nurseZips = Array.from(
    new Set(nurses.map((n) => n.zip_code).filter((z): z is string => !!z)),
  );
  if (nurseZips.length === 0) return nurses;

  const supabase = await createClient();
  const { data: zipRows } = await supabase
    .from("zip_codes")
    .select("zip, latitude, longitude")
    .in("zip", [viewerZip, ...nurseZips]);
  if (!zipRows || zipRows.length === 0) return nurses;

  const viewerLoc = zipRows.find((z) => z.zip === viewerZip);
  if (!viewerLoc) return nurses;

  const coordByZip = new Map(
    zipRows.map((z) => [z.zip, { lat: z.latitude, lng: z.longitude }]),
  );

  return nurses.map((n) => {
    if (!n.zip_code) return n;
    const loc = coordByZip.get(n.zip_code);
    if (!loc) return n;
    const miles = haversineMiles(
      viewerLoc.latitude,
      viewerLoc.longitude,
      loc.lat,
      loc.lng,
    );
    return { ...n, distance_miles: Math.round(miles) };
  });
}

function applyDistanceFilter(
  nurses: InternalCard[],
  filters: SearchFilters,
): InternalCard[] {
  if (!filters.zip || filters.distance === undefined) return nurses;
  const max = filters.distance;
  return nurses.filter((n) => {
    if (n.distance_miles === null) return false;
    return n.distance_miles <= max;
  });
}

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Ranking ───────────────────────────────────────────────────

function rankCards(
  nurses: InternalCard[],
  viewerCommPref: string | null,
): InternalCard[] {
  return rankNursesPure(nurses, viewerCommPref);
}

// ── Partial matches ───────────────────────────────────────────

interface PartialOptions {
  filters: SearchFilters;
  viewerZip: string | null;
  viewerCommPref: string | null;
  excludeUserIds: string[];
  limit: number;
}

async function getPartialMatches(
  opts: PartialOptions,
): Promise<InternalCard[]> {
  const { filters, viewerZip, viewerCommPref, excludeUserIds, limit } = opts;
  const excluded = new Set(excludeUserIds);

  // Stage 1: relax location (drop distance filter). Only meaningful if the
  // user actually set a location filter.
  const hasLocationFilter = filters.zip && filters.distance !== undefined;
  let stage1: InternalCard[] = [];
  if (hasLocationFilter) {
    const raw = await runQuery(filters, { skipLocation: true });
    const enriched = await enrichWithDistance(raw, viewerZip);
    const ranked = rankCards(
      enriched.filter((n) => !excluded.has(n.user_id)),
      viewerCommPref,
    );
    stage1 = ranked.slice(0, limit);
    if (stage1.length >= limit) return stage1;
    stage1.forEach((n) => excluded.add(n.user_id));
  }

  // Stage 2: also relax availability.
  const stage2 = await runRelaxedAvailability(
    filters,
    viewerZip,
    viewerCommPref,
    excluded,
    limit - stage1.length,
  );
  return [...stage1, ...stage2];
}

async function runRelaxedAvailability(
  filters: SearchFilters,
  viewerZip: string | null,
  viewerCommPref: string | null,
  excluded: Set<string>,
  limit: number,
): Promise<InternalCard[]> {
  if (limit <= 0) return [];
  const raw = await runQuery(filters, {
    skipLocation: true,
    skipAvailability: true,
  });
  const enriched = await enrichWithDistance(raw, viewerZip);
  const ranked = rankCards(
    enriched.filter((n) => !excluded.has(n.user_id)),
    viewerCommPref,
  );
  return ranked.slice(0, limit);
}

// ── Photo URLs ────────────────────────────────────────────────

async function attachPhotoUrls(cards: InternalCard[]): Promise<void> {
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
