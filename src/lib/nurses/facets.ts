import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyListedNurseFilter, applyAvailabilityFilter } from "./visibility";
import {
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";

/**
 * What the directory can actually be filtered by, counted from the nurses in
 * it (#766).
 *
 * Every filter on Find a Nurse used to be rendered from a TypeScript enum or
 * a hardcoded array, so the panel offered options with nobody behind them and
 * omitted values nurses had entered. Measured against production on
 * 2026-09-03: Russian and Portuguese were offered and held by nobody, French,
 * Tagalog, Arabic, Farsi and Hindi were held by seven nurses and never
 * offered, and the offered spelling "Haitian Creole" could not match the
 * stored "Haitian creole" at all, because the language filter is an exact
 * array overlap.
 *
 * The rule: no option is offered unless at least one nurse the directory can
 * return is behind it.
 */

export interface FacetRow {
  credential: Credential | null;
  care_types: CareType[] | null;
  skills: Skill[] | null;
  languages: string[] | null;
  gender: Gender | null;
  availability_commitment: AvailabilityCommitment[] | null;
  time_slots: TimeSlot[] | null;
  rate_min: number | null;
  rate_max: number | null;
  years_experience: number | null;
}

export interface FacetOption<T extends string = string> {
  value: T;
  /** Nurses behind this option, so a family can see where the depth is. */
  count: number;
}

export interface FacetRange {
  min: number;
  max: number;
}

export interface DirectoryFacets {
  credential: FacetOption<Credential>[];
  care_types: FacetOption<CareType>[];
  skills: FacetOption<Skill>[];
  /** Free text on the profile, so the stored spelling is the option. */
  languages: FacetOption[];
  gender: FacetOption<Gender>[];
  availability_commitment: FacetOption<AvailabilityCommitment>[];
  time_slots: FacetOption<TimeSlot>[];
  /**
   * The rates nurses state, for a hint beside the budget box. Deliberately
   * NOT a bound on it: a nurse who states no minimum matches every budget
   * (`rate_min.is.null` in the search's own filter), so a budget under the
   * cheapest stated rate is not a dead end and must not be refused.
   */
  rate: FacetRange | null;
  /**
   * A real bound. The search applies `years_experience >= n` and every listed
   * nurse has a value, so asking for more than the most experienced nurse
   * returns nobody.
   */
  experience: FacetRange | null;
  total: number;
}

const SCALAR_FACETS = ["credential", "gender"] as const;
const ARRAY_FACETS = [
  "care_types",
  "skills",
  "languages",
  "availability_commitment",
  "time_slots",
] as const;

const FACET_KEYS = [
  ...SCALAR_FACETS,
  ...ARRAY_FACETS,
  "rate_min",
  "rate_max",
  "years_experience",
] as const;

export const FACET_COLUMNS = `
      ${FACET_KEYS.join(",\n      ")},
      users!inner ( is_deleted, is_suspended )
    `;

/**
 * PostgREST's own default ceiling. A read that comes back holding exactly
 * this many rows has been truncated, and a tally of a truncated directory
 * offers a filter set that is missing whatever sits past the cap, so it
 * refuses rather than under-reporting.
 */
const FACET_ROW_CAP = 1000;

function rank(counts: Map<string, number>): FacetOption[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function numericRange(values: number[]): FacetRange | null {
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Count the options in a set of directory rows.
 *
 * Pure, so the rule (an option exists only where a nurse does) is testable
 * without a database.
 */
export function tallyFacets(rows: FacetRow[]): DirectoryFacets {
  const counts = new Map<string, Map<string, number>>();
  for (const key of [...SCALAR_FACETS, ...ARRAY_FACETS]) {
    counts.set(key, new Map());
  }

  const rates: number[] = [];
  const experience: number[] = [];

  for (const row of rows) {
    for (const key of SCALAR_FACETS) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      const bucket = counts.get(key)!;
      bucket.set(value, (bucket.get(value) ?? 0) + 1);
    }

    for (const key of ARRAY_FACETS) {
      const list = row[key];
      if (!Array.isArray(list)) continue;
      const bucket = counts.get(key)!;
      // One nurse counts once per option however many times she lists it.
      for (const value of new Set(list)) {
        if (value === null || value === undefined || value === "") continue;
        bucket.set(value, (bucket.get(value) ?? 0) + 1);
      }
    }

    if (typeof row.rate_min === "number") rates.push(row.rate_min);
    if (typeof row.rate_max === "number") rates.push(row.rate_max);
    if (typeof row.years_experience === "number") {
      experience.push(row.years_experience);
    }
  }

  // Each cast restates what the column already guarantees: these values were
  // read out of an enum-typed column, and rank() has no way to say so. They
  // are asserted here, once, rather than at every call site that renders one.
  return {
    credential: rank(counts.get("credential")!) as FacetOption<Credential>[],
    care_types: rank(counts.get("care_types")!) as FacetOption<CareType>[],
    skills: rank(counts.get("skills")!) as FacetOption<Skill>[],
    languages: rank(counts.get("languages")!),
    gender: rank(counts.get("gender")!) as FacetOption<Gender>[],
    availability_commitment: rank(
      counts.get("availability_commitment")!,
    ) as FacetOption<AvailabilityCommitment>[],
    time_slots: rank(counts.get("time_slots")!) as FacetOption<TimeSlot>[],
    rate: numericRange(rates),
    experience: numericRange(experience),
    total: rows.length,
  };
}

/**
 * The options the directory can offer right now.
 *
 * Drawn through the same two predicates the search itself applies, so the
 * facet set and the result set cannot disagree about who counts. The
 * availability filter is applied UNRELAXED on purpose: that is the smallest
 * population the search can return, and "also show nurses not accepting new
 * clients" only ever adds to it, so an option counted here is never a dead
 * end in either state of that switch.
 *
 * Throws on a failed read. An empty facet set and a failed read would render
 * as the same thing, a panel with no options, and that is the defect #780
 * describes: a failure that looks exactly like an honest empty answer.
 */
export async function getDirectoryFacets(): Promise<DirectoryFacets> {
  const supabase = createServiceRoleClient();

  let query = supabase.from("nurse_profiles").select(FACET_COLUMNS);
  query = applyListedNurseFilter(query);
  query = applyAvailabilityFilter(query, { relaxed: false });

  const { data, error } = await query.limit(FACET_ROW_CAP);

  if (error || !data) {
    throw new Error(
      `Directory facet read failed: ${
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "no rows and no error"
      }`,
    );
  }

  if (data.length >= FACET_ROW_CAP) {
    throw new Error(
      `Directory facet read returned ${data.length} rows, the cap. The tally would be missing every nurse past it.`,
    );
  }

  return tallyFacets(data as unknown as FacetRow[]);
}
