import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "./visibility";
import { SEARCH } from "@/lib/constants";
import { GENDER_FILTER_ANY, type SearchFilters } from "./search-params";
import { rankNurses as rankNursesPure } from "./search-ranking";
import {
  NURSE_CARD_COLUMNS,
  attachNurseCardPhotos,
  shapeNurseCards,
  toPublicNurseCard,
  type InternalNurseCard,
  type NurseSearchCard,
} from "./card";

export type { NurseSearchCard } from "./card";

// Cap raw SQL fetch to keep the in-app distance filter / ranking cheap.
// At launch scale this won't trigger. If it does, we surface it so we know
// to paginate in SQL instead.
const SQL_FETCH_CAP = 500;

// Show partials when fewer than this many full matches exist in total.
const PARTIAL_MATCHES_THRESHOLD = 10;

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
  // Whether the viewer may see nurse identity (last name). Defaults to false so
  // a caller that forgets to pass it leaks nothing (#381). The profile page's
  // per-nurse license gating is separate; cards never carry license_number.
  viewerCanSeeIdentity?: boolean;
}

// ── Public entry point ────────────────────────────────────────

export async function searchNurses(
  options: SearchOptions,
): Promise<SearchResult> {
  const {
    filters,
    viewerZip,
    viewerCommPref,
    viewerRevealedIds,
    viewerCanSeeIdentity = false,
  } = options;

  const fullRaw = await runQuery(filters, viewerCanSeeIdentity);
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

  let partials: InternalNurseCard[] = [];
  if (totalFull < PARTIAL_MATCHES_THRESHOLD && page === 1) {
    const slotsToFill = pageSize - items.length;
    if (slotsToFill > 0) {
      partials = await getPartialMatches({
        filters,
        canSeeIdentity: viewerCanSeeIdentity,
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

  await Promise.all([
    attachNurseCardPhotos(items),
    attachNurseCardPhotos(partials),
  ]);

  return {
    items: items.map(toPublicNurseCard),
    partials: partials.map(toPublicNurseCard),
    totalFull,
    page,
    totalPages,
    hitResultCap: fullRaw.length >= SQL_FETCH_CAP,
  };
}

// ── Raw DB fetch ──────────────────────────────────────────────

interface QueryOptions {
  skipLocation?: boolean;
  skipAvailability?: boolean;
}

async function runQuery(
  filters: SearchFilters,
  canSeeIdentity: boolean,
  opts: QueryOptions = {},
): Promise<InternalNurseCard[]> {
  // Search joins nurse_profiles to users for first_name / last_name /
  // zip_code on the cards. RLS on users only exposes id = auth.uid()
  // rows, which would zero out the inner join for anon and family
  // viewers. We use the service-role client here because the search
  // result is public-by-design (only verified non-deleted, non-suspended
  // nurses are returned) and cards never render contact fields.
  const supabase = createServiceRoleClient();

  let query = supabase.from("nurse_profiles").select(NURSE_CARD_COLUMNS);
  query = applyVisibleNurseFilter(query);

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

  return shapeNurseCards(data, { canSeeIdentity });
}

// ── Distance ──────────────────────────────────────────────────

async function enrichWithDistance(
  nurses: InternalNurseCard[],
  viewerZip: string | null,
): Promise<InternalNurseCard[]> {
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
  nurses: InternalNurseCard[],
  filters: SearchFilters,
): InternalNurseCard[] {
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
  nurses: InternalNurseCard[],
  viewerCommPref: string | null,
): InternalNurseCard[] {
  return rankNursesPure(nurses, viewerCommPref);
}

// ── Partial matches ───────────────────────────────────────────

interface PartialOptions {
  filters: SearchFilters;
  canSeeIdentity: boolean;
  viewerZip: string | null;
  viewerCommPref: string | null;
  excludeUserIds: string[];
  limit: number;
}

async function getPartialMatches(
  opts: PartialOptions,
): Promise<InternalNurseCard[]> {
  const {
    filters,
    canSeeIdentity,
    viewerZip,
    viewerCommPref,
    excludeUserIds,
    limit,
  } = opts;
  const excluded = new Set(excludeUserIds);

  // Stage 1: relax location (drop distance filter). Only meaningful if the
  // user actually set a location filter.
  const hasLocationFilter = filters.zip && filters.distance !== undefined;
  let stage1: InternalNurseCard[] = [];
  if (hasLocationFilter) {
    const raw = await runQuery(filters, canSeeIdentity, {
      skipLocation: true,
    });
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
    canSeeIdentity,
    viewerZip,
    viewerCommPref,
    excluded,
    limit - stage1.length,
  );
  return [...stage1, ...stage2];
}

async function runRelaxedAvailability(
  filters: SearchFilters,
  canSeeIdentity: boolean,
  viewerZip: string | null,
  viewerCommPref: string | null,
  excluded: Set<string>,
  limit: number,
): Promise<InternalNurseCard[]> {
  if (limit <= 0) return [];
  const raw = await runQuery(filters, canSeeIdentity, {
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
