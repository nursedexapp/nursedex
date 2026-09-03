import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";
import {
  Credential,
  CareType,
  Skill,
  Gender,
  AvailabilityCommitment,
  TimeSlot,
} from "@/types/enums";
import { tallyFacets, getDirectoryFacets, type FacetRow } from "./facets";

/**
 * The rule these tests exist for (#766): no filter option is offered unless
 * at least one nurse in the directory is behind it. Every option the panel
 * shows today comes from a TypeScript enum or a hardcoded list, so the
 * directory offers Russian and Portuguese, which nobody speaks, and hides
 * French, Tagalog, Arabic, Farsi and Hindi, which five nurses do.
 */

function row(overrides: Partial<FacetRow> = {}): FacetRow {
  return {
    credential: Credential.RN,
    care_types: [CareType.ELDERLY],
    skills: [Skill.VITAL_SIGNS],
    languages: ["English"],
    gender: Gender.FEMALE,
    availability_commitment: [AvailabilityCommitment.PER_DIEM],
    time_slots: [TimeSlot.WEEKDAYS],
    rate_min: null,
    rate_max: null,
    years_experience: 5,
    ...overrides,
  };
}

const values = (options: Array<{ value: string }>) => options.map((o) => o.value);

describe("tallyFacets", () => {
  it("does not offer an option no nurse in the directory is behind", () => {
    const facets = tallyFacets([
      row({ languages: ["English", "Spanish"] }),
      row({ languages: ["English"] }),
    ]);

    expect(values(facets.languages)).toEqual(["English", "Spanish"]);
    expect(values(facets.languages)).not.toContain("Russian");
  });

  it("counts the nurses behind each option", () => {
    const facets = tallyFacets([
      row({ languages: ["English", "Spanish"] }),
      row({ languages: ["English"] }),
      row({ languages: ["English"] }),
    ]);

    expect(facets.languages).toEqual([
      { value: "English", count: 3 },
      { value: "Spanish", count: 1 },
    ]);
  });

  it("puts the option with the most nurses behind it first", () => {
    const facets = tallyFacets([
      row({ credential: Credential.LPN }),
      row({ credential: Credential.RN }),
      row({ credential: Credential.RN }),
    ]);

    expect(values(facets.credential)).toEqual([Credential.RN, Credential.LPN]);
  });

  it("counts a nurse once when the same value repeats in her list", () => {
    const facets = tallyFacets([
      row({ skills: [Skill.VITAL_SIGNS, Skill.VITAL_SIGNS] }),
    ]);

    expect(facets.skills).toEqual([{ value: Skill.VITAL_SIGNS, count: 1 }]);
  });

  it("leaves a facet empty rather than offering a zero count option", () => {
    const facets = tallyFacets([row({ time_slots: [] }), row({ time_slots: [] })]);

    expect(facets.time_slots).toEqual([]);
  });

  it("bounds years of experience at the most experienced nurse, since asking for more returns nobody", () => {
    const facets = tallyFacets([
      row({ years_experience: 1 }),
      row({ years_experience: 49 }),
    ]);

    expect(facets.experience).toEqual({ min: 1, max: 49 });
  });

  it("reports the rate range from the nurses who state one", () => {
    const facets = tallyFacets([
      row({ rate_min: 30, rate_max: 60 }),
      row({ rate_min: 20, rate_max: 175 }),
      row({ rate_min: null, rate_max: null }),
    ]);

    expect(facets.rate).toEqual({ min: 20, max: 175 });
  });

  it("reports no rate range when no nurse states one", () => {
    const facets = tallyFacets([row(), row()]);

    expect(facets.rate).toBeNull();
  });

  it("counts the nurses it was given", () => {
    expect(tallyFacets([row(), row()]).total).toBe(2);
  });
});

// ── The read ──────────────────────────────────────────────────

const state: { rows: unknown[] | null; error: unknown } = {
  rows: [],
  error: null,
};
const filtersApplied: string[] = [];

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () =>
      createQueryBuilder({
        eq: (...args: unknown[]) => {
          filtersApplied.push(`eq:${String(args[0])}=${String(args[1])}`);
          return "chain";
        },
        or: (...args: unknown[]) => {
          filtersApplied.push(`or:${String(args[0])}`);
          return "chain";
        },
        then: () => ({ data: state.rows, error: state.error }),
      }),
  }),
}));

beforeEach(() => {
  state.rows = [];
  state.error = null;
  filtersApplied.length = 0;
});

describe("getDirectoryFacets", () => {
  it("throws rather than reporting a directory with no filter options when the read fails", async () => {
    state.rows = null;
    state.error = { message: "connection reset" };

    // An empty facet set and a failed read render identically: a panel with
    // no options. Distinct causes get distinct outcomes (#780), so this one
    // has to be loud.
    await expect(getDirectoryFacets()).rejects.toThrow(/facet/i);
  });

  it("counts only nurses the directory can actually return", async () => {
    state.rows = [
      {
        credential: "rn",
        care_types: ["elderly"],
        skills: ["vital_signs"],
        languages: ["English"],
        gender: "female",
        availability_commitment: ["per_diem"],
        time_slots: ["weekdays"],
        rate_min: null,
        rate_max: null,
        years_experience: 5,
      },
    ];

    const facets = await getDirectoryFacets();

    expect(facets.total).toBe(1);
    // The same four conditions the directory search itself applies, plus the
    // minimum content rule and availability. A facet set drawn from a wider
    // population than the search would offer options that return nothing.
    expect(filtersApplied).toContain("eq:verification_status=verified");
    expect(filtersApplied).toContain("eq:is_hidden=false");
    expect(filtersApplied).toContain("eq:users.is_deleted=false");
    expect(filtersApplied).toContain("eq:users.is_suspended=false");
    expect(filtersApplied).toContain("eq:is_available=true");
    expect(filtersApplied).toContain("or:has_photo.eq.true,bio.neq.");
  });
});
