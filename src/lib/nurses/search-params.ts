import { z } from "zod";
import {
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";

// ── Gender filter ─────────────────────────────────────────────
// "any" (default) includes prefer_not_to_say.
// Specific selections exclude prefer_not_to_say per product decision.
export const GENDER_FILTER_ANY = "any" as const;
export type GenderFilter = typeof GENDER_FILTER_ANY | Gender;

// ── Schema ────────────────────────────────────────────────────
// Parses raw URL string values into typed filters.
// Anything malformed is dropped (via .catch) so hand-edited URLs never crash the page.

const commaArrayOfEnum = <T extends Record<string, string>>(e: T) =>
  z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.nativeEnum(e)))
    .default([])
    .catch([]);

const commaArrayOfString = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(40)))
  .default([])
  .catch([]);

const optionalPositiveInt = z
  .string()
  .transform((v) => Number.parseInt(v, 10))
  .pipe(z.number().int().min(0))
  .optional()
  .catch(undefined);

const boolFlag = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .default(false)
  .catch(false);

const pageNumber = z
  .string()
  .transform((v) => Math.max(1, Number.parseInt(v, 10) || 1))
  .default(1)
  .catch(1);

export const searchParamsSchema = z.object({
  credential: z.nativeEnum(Credential).optional().catch(undefined),
  care_type: z.nativeEnum(CareType).optional().catch(undefined),
  skills: commaArrayOfEnum(Skill),
  languages: commaArrayOfString,
  gender: z
    .union([z.literal(GENDER_FILTER_ANY), z.nativeEnum(Gender)])
    .default(GENDER_FILTER_ANY)
    .catch(GENDER_FILTER_ANY),
  rate_min: optionalPositiveInt,
  rate_max: optionalPositiveInt,
  experience_min: optionalPositiveInt,
  zip: z
    .string()
    .regex(/^\d{5}$/)
    .optional()
    .catch(undefined),
  distance: optionalPositiveInt, // miles; ignored unless zip is set
  availability_commitment: commaArrayOfEnum(AvailabilityCommitment),
  time_slots: commaArrayOfEnum(TimeSlot),
  show_unavailable: boolFlag,
  // Constrain results to nurses this family has saved (#776). The family is
  // always taken from the session; this flag only says whether to apply the
  // constraint, never whose saves to apply. Ignored for logged out and
  // non-family viewers.
  saved: boolFlag,
  page: pageNumber,
});

export type SearchFilters = z.infer<typeof searchParamsSchema>;

// ── Parse ─────────────────────────────────────────────────────

/**
 * Parse Next.js searchParams (object of string | string[] | undefined)
 * into a validated SearchFilters object. Invalid values fall back to defaults.
 */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined> | URLSearchParams,
): SearchFilters {
  const source = raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw;
  const flattened: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    flattened[k] = Array.isArray(v) ? v[0] : v;
  }
  return searchParamsSchema.parse(flattened);
}

// ── Serialize ─────────────────────────────────────────────────

/**
 * Serialize a partial SearchFilters object to a URLSearchParams instance,
 * omitting empty/default values so URLs stay clean.
 */
export function toURLSearchParams(
  filters: Partial<SearchFilters>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.credential) params.set("credential", filters.credential);
  if (filters.care_type) params.set("care_type", filters.care_type);
  if (filters.skills && filters.skills.length > 0) {
    params.set("skills", filters.skills.join(","));
  }
  if (filters.languages && filters.languages.length > 0) {
    params.set("languages", filters.languages.join(","));
  }
  if (filters.gender && filters.gender !== GENDER_FILTER_ANY) {
    params.set("gender", filters.gender);
  }
  if (filters.rate_min !== undefined)
    params.set("rate_min", String(filters.rate_min));
  if (filters.rate_max !== undefined)
    params.set("rate_max", String(filters.rate_max));
  if (filters.experience_min !== undefined) {
    params.set("experience_min", String(filters.experience_min));
  }
  if (filters.zip) params.set("zip", filters.zip);
  if (filters.distance !== undefined)
    params.set("distance", String(filters.distance));
  if (
    filters.availability_commitment &&
    filters.availability_commitment.length > 0
  ) {
    params.set(
      "availability_commitment",
      filters.availability_commitment.join(","),
    );
  }
  if (filters.time_slots && filters.time_slots.length > 0) {
    params.set("time_slots", filters.time_slots.join(","));
  }
  if (filters.show_unavailable) params.set("show_unavailable", "true");
  // Without this, the chip clears itself the instant any other filter is
  // touched and drops off every page-two link, because FilterPanel.apply,
  // SearchPagination.hrefForPage and survey/results all rebuild the whole URL
  // through this one function (#776).
  if (filters.saved) params.set("saved", "true");
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  return params;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * True if no user-controllable filters are set (ignoring pagination and
 * the show_unavailable toggle, which default to off). Used to decide
 * whether to show empty-state copy vs zero-result copy.
 */
export function isEmptyFilterSet(filters: SearchFilters): boolean {
  return (
    !filters.credential &&
    !filters.care_type &&
    filters.skills.length === 0 &&
    filters.languages.length === 0 &&
    filters.gender === GENDER_FILTER_ANY &&
    filters.rate_min === undefined &&
    filters.rate_max === undefined &&
    filters.experience_min === undefined &&
    !filters.zip &&
    !filters.saved &&
    filters.availability_commitment.length === 0 &&
    filters.time_slots.length === 0
  );
}
