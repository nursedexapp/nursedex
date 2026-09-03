import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  applyListedNurseFilter,
  applyAvailabilityFilter,
} from "./visibility";
import { keywordPattern, matchesNurseName } from "./search-keyword";
import { SEARCH } from "@/lib/constants";
import {
  GENDER_FILTER_ANY,
  DEFAULT_SORT,
  effectiveSort,
  type SearchFilters,
  type SortOption,
} from "./search-params";
import {
  orderNurses,
  DEFAULT_FEATURED_RANGE_MILES,
  type DistanceContext,
} from "./search-ranking";
import {
  NURSE_CARD_COLUMNS,
  applyTowns,
  attachNurseCardPhotos,
  lookupZips,
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
  // The origin zip we were asked to measure from and could not find in
  // zip_codes, or null when there was nothing to locate or we located it.
  // When set, no card carries a distance and any distance constraint was
  // ignored rather than silently emptying the results (#769). The page has to
  // say so: "we could not locate 06830" is honest, returning zero is not.
  unlocatableZip: string | null;
  // Whether the results are in nearest-first order, which they are exactly
  // when a zip was given and we could place it. The sentence telling a family
  // how the list is ordered reads this, so it cannot claim an order that was
  // not used.
  orderedByDistance: boolean;
  // The sort actually applied, so the sentence describing the order can name
  // the one the family chose rather than the default.
  sort: SortOption;
}

export interface SearchOptions {
  filters: SearchFilters;
  // The viewer's own profile zip, used only as the fallback origin when they
  // have typed no zip of their own. The typed zip always wins: it is the one
  // the box on screen is labelled with. Callers must not pre-resolve this
  // themselves, which is how /nurses and /survey/results came to disagree
  // about which zip a distance was measured from (#769).
  viewerZip?: string | null;
  viewerCommPref?: string | null;
  // Nurse user_ids the viewing family has already revealed. When set, those
  // cards are marked revealed and sorted below the un-revealed ones.
  viewerRevealedIds?: Set<string>;
  // Whether the viewer may see nurse identity (last name). Defaults to false so
  // a caller that forgets to pass it leaks nothing (#381). The profile page's
  // per-nurse license gating is separate; cards never carry license_number.
  viewerCanSeeIdentity?: boolean;
  // Whether the viewer is signed in, which is what gates bio, rate and
  // availability on the card (#773, decision D1). Required, with no default:
  // a default of false would tell a paying family on their own dashboard to
  // log in to see a rate, and a default of true would ship every nurse's rate
  // to logged out visitors. Every call site states it.
  viewerIsSignedIn: boolean;
  // Every nurse this family has saved, when the "Saved only" chip is on.
  // Always resolved from the session by the caller; the URL flag only says
  // whether to apply the constraint (#776). Undefined means do not constrain.
  viewerSavedIds?: Set<string>;
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
    viewerIsSignedIn,
    viewerSavedIds,
  } = options;

  // One origin zip, derived here rather than by each caller.
  const originZip = filters.zip ?? viewerZip ?? null;

  const gate = {
    canSeeIdentity: viewerCanSeeIdentity,
    canSeeDetails: viewerIsSignedIn,
  };

  // Ignored for logged out and non-family viewers: the page passes no saved
  // set for them, so the flag in the URL does nothing.
  const savedOnly = filters.saved && viewerSavedIds !== undefined;

  const fullRaw = await runQuery(filters, gate, {
    savedIds: savedOnly ? viewerSavedIds : undefined,
  });
  const { cards: fullWithDistance, originResolved } = await enrichWithLocation(
    fullRaw,
    originZip,
  );
  const fullAfterDistance = applyDistanceFilter(
    fullWithDistance,
    filters,
    originResolved,
  );
  const ordering = distanceContext(originZip, originResolved, filters);
  // Closest is only honourable when there is a placed zip to measure from.
  const sort = effectiveSort(filters.sort, ordering.originResolved);
  let fullRanked = rankCards(
    fullAfterDistance,
    viewerCommPref ?? null,
    ordering,
    sort,
  );

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
  // Partials relax the filters to fill the page, and they know nothing about a
  // saved constraint. A family with three saves would otherwise be shown seven
  // nurses they never saved, under a grid that claims to show only saves.
  if (!savedOnly && totalFull < PARTIAL_MATCHES_THRESHOLD && page === 1) {
    const slotsToFill = pageSize - items.length;
    if (slotsToFill > 0) {
      partials = await getPartialMatches({
        filters,
        gate,
        originZip,
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
    unlocatableZip: originZip && !originResolved ? originZip : null,
    orderedByDistance: ordering.originResolved,
    sort,
  };
}

// ── Raw DB fetch ──────────────────────────────────────────────

/** Which of the card's gated fields this viewer may see. */
interface CardGate {
  canSeeIdentity: boolean;
  canSeeDetails: boolean;
}

interface QueryOptions {
  skipLocation?: boolean;
  skipAvailability?: boolean;
  /** Constrain to these nurse ids. An empty set means no nurse can match. */
  savedIds?: Set<string>;
}

async function runQuery(
  filters: SearchFilters,
  gate: CardGate,
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
  query = applyListedNurseFilter(query);

  if (opts.savedIds) {
    // A family with no saves matches nothing. PostgREST's .in() with an empty
    // list is an error rather than an empty result, so answer directly.
    if (opts.savedIds.size === 0) return [];
    query = query.in("user_id", [...opts.savedIds]);
  }

  // Availability visibility, shared with the facet counts behind the filter
  // panel so the two cannot disagree about who the directory can return
  // (#766). The rule itself is documented on applyAvailabilityFilter.
  query = applyAvailabilityFilter(query, {
    relaxed: !!opts.skipAvailability || filters.show_unavailable,
  });

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

  // Free text (#729). The bio and the care philosophy can be matched in the
  // query; a name cannot travel with them, because PostgREST refuses a filter
  // on an embedded table inside a top-level `or` (measured 2026-09-03: 400,
  // "failed to parse logic tree"). So the names are matched first and carried
  // as ids, which is cheap: names are small, bios are not.
  if (filters.q) {
    const pattern = keywordPattern(filters.q);
    // A keyword of nothing but wildcards is dropped rather than sent: "**"
    // matches every nurse, which reads as the search being ignored.
    if (pattern) {
      // Bio is matched for everyone: it is already this nurse's public meta
      // description, so a match confirms nothing a search engine has not
      // indexed. The care philosophy is shown only to a signed in viewer
      // (NurseProfilePublic renders the anon branch instead), so matching it
      // for a logged out visitor would hand back its contents through the
      // result count, one guess at a time, without ever displaying them
      // (#935). Same rule as the last name above: a viewer may only search
      // what she is allowed to read.
      const clauses = [`bio.ilike."${pattern}"`];
      if (gate.canSeeDetails) {
        clauses.push(`care_philosophy.ilike."${pattern}"`);
      }
      const nameMatches = await nurseIdsMatchingName(filters.q, gate);
      if (nameMatches.length > 0) {
        clauses.push(`user_id.in.(${nameMatches.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }
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

  return shapeNurseCards(data, gate);
}

/**
 * The listed nurses whose name matches a keyword (#729).
 *
 * Reads every listed nurse's name, which is two short strings each, and
 * matches in memory. The alternative is a second round trip per name field,
 * because the name lives on the embedded users row and PostgREST cannot OR
 * across that join.
 *
 * It THROWS on a failed read rather than answering "nobody by that name".
 * Those two are indistinguishable to the family, and the wrong one of them
 * tells her the nurse she was recommended is not on NurseDex (#780).
 */
async function nurseIdsMatchingName(
  keyword: string,
  gate: CardGate,
): Promise<string[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("nurse_profiles")
    .select("user_id,users!inner(first_name,last_name,is_deleted,is_suspended)");
  query = applyListedNurseFilter(query);

  const { data, error } = await query.limit(SQL_FETCH_CAP);

  if (error || !data) {
    throw new Error(
      `Nurse name search failed: ${
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "no rows and no error"
      }`,
    );
  }

  return (data as unknown as NameRow[])
    .filter((row) => row.users && matchesNurseName(row.users, keyword, gate))
    .map((row) => row.user_id);
}

interface NameRow {
  user_id: string;
  users: { first_name: string | null; last_name: string | null } | null;
}

// ── Distance ──────────────────────────────────────────────────

/**
 * Result of trying to measure every card from one origin zip.
 *
 * `originResolved` separates "we found the origin and measured" from "we could
 * not find it, so no card has a distance". Those look identical on the cards
 * themselves, and treating them the same is what let a distance filter drop
 * every row in silence (#769).
 */
interface DistanceResult {
  cards: InternalNurseCard[];
  originResolved: boolean;
}

async function enrichWithLocation(
  nurses: InternalNurseCard[],
  originZip: string | null,
): Promise<DistanceResult> {
  if (nurses.length === 0) return { cards: nurses, originResolved: true };

  const nurseZips = nurses
    .map((n) => n.zip_code)
    .filter((z): z is string => !!z);

  // One lookup serves both the town on every card and the distance from the
  // origin, so the busiest public page pays for it once.
  const zipRows = await lookupZips(
    originZip ? [originZip, ...nurseZips] : nurseZips,
  );
  applyTowns(nurses, zipRows);

  // Nothing to locate is not the same as failing to locate something.
  if (!originZip) return { cards: nurses, originResolved: true };

  const originLoc = zipRows.get(originZip);
  if (!originLoc) return { cards: nurses, originResolved: false };

  const cards = nurses.map((n) => {
    if (!n.zip_code) return n;
    const loc = zipRows.get(n.zip_code);
    // The nurse's own zip is the missing one here, not the origin. Her card
    // keeps a null distance and is dropped by a radius filter, because
    // claiming she is inside a radius nobody measured would be worse.
    if (!loc) return n;
    const miles = haversineMiles(
      originLoc.latitude,
      originLoc.longitude,
      loc.latitude,
      loc.longitude,
    );
    return { ...n, distance_miles: Math.round(miles) };
  });

  return { cards, originResolved: true };
}

/**
 * Keep only nurses inside the requested radius.
 *
 * Applied only when the origin actually resolved. With an unresolvable origin
 * every card carries a null distance, so the filter would reject all of them
 * and the page would read "no nurses match your filters" for a reason no
 * family could act on.
 */
function applyDistanceFilter(
  nurses: InternalNurseCard[],
  filters: SearchFilters,
  originResolved: boolean,
): InternalNurseCard[] {
  if (filters.distance === undefined) return nurses;
  if (!originResolved) return nurses;
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
  distance?: DistanceContext,
  sort: SortOption = DEFAULT_SORT,
): InternalNurseCard[] {
  return orderNurses(nurses, viewerCommPref, { sort, distance });
}

/**
 * The ordering context for one search.
 *
 * `originResolved` on its own is not it: enrichWithLocation reports true when
 * there was nothing to locate, which is the commonest case of all. Distance
 * only orders when a zip was actually given AND placed.
 */
function distanceContext(
  originZip: string | null,
  originResolved: boolean,
  filters: SearchFilters,
): DistanceContext {
  return {
    originResolved: !!originZip && originResolved,
    featuredRangeMiles: filters.distance ?? DEFAULT_FEATURED_RANGE_MILES,
  };
}

// ── Partial matches ───────────────────────────────────────────

interface PartialOptions {
  filters: SearchFilters;
  gate: CardGate;
  originZip: string | null;
  viewerCommPref: string | null;
  excludeUserIds: string[];
  limit: number;
}

async function getPartialMatches(
  opts: PartialOptions,
): Promise<InternalNurseCard[]> {
  const { filters, gate, originZip, viewerCommPref, excludeUserIds, limit } =
    opts;
  const excluded = new Set(excludeUserIds);

  // Stage 1: relax location (drop distance filter). Only meaningful if the
  // user actually set a location filter.
  const hasLocationFilter = filters.zip && filters.distance !== undefined;
  let stage1: InternalNurseCard[] = [];
  if (hasLocationFilter) {
    const raw = await runQuery(filters, gate, {
      skipLocation: true,
    });
    const { cards: enriched, originResolved: partialResolved } =
      await enrichWithLocation(raw, originZip);
    const ranked = rankCards(
      enriched.filter((n) => !excluded.has(n.user_id)),
      viewerCommPref,
      distanceContext(originZip, partialResolved, filters),
      filters.sort,
    );
    stage1 = ranked.slice(0, limit);
    if (stage1.length >= limit) return stage1;
    stage1.forEach((n) => excluded.add(n.user_id));
  }

  // Stage 2: also relax availability.
  const stage2 = await runRelaxedAvailability(
    filters,
    gate,
    originZip,
    viewerCommPref,
    excluded,
    limit - stage1.length,
  );
  return [...stage1, ...stage2];
}

async function runRelaxedAvailability(
  filters: SearchFilters,
  gate: CardGate,
  originZip: string | null,
  viewerCommPref: string | null,
  excluded: Set<string>,
  limit: number,
): Promise<InternalNurseCard[]> {
  if (limit <= 0) return [];
  const raw = await runQuery(filters, gate, {
    skipLocation: true,
    skipAvailability: true,
  });
  const { cards: enriched, originResolved: partialResolved } =
    await enrichWithLocation(raw, originZip);
  const ranked = rankCards(
    enriched.filter((n) => !excluded.has(n.user_id)),
    viewerCommPref,
    distanceContext(originZip, partialResolved, filters),
    filters.sort,
  );
  return ranked.slice(0, limit);
}
