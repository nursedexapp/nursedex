import { describe, it, expect } from "vitest";
import { rankNurses, type RankableNurse } from "./search-ranking";
import {
  parseSearchParams,
  toURLSearchParams,
  isEmptyFilterSet,
  GENDER_FILTER_ANY,
} from "./search-params";
import { Skill, Gender } from "@/types/enums";

function card(overrides: Partial<RankableNurse>): RankableNurse {
  return {
    tier: "free",
    has_photo: false,
    communication_preference: null,
    review_count: 0,
    avg_rating: null,
    profile_completeness: 0,
    ...overrides,
  };
}

describe("rankNurses", () => {
  it("puts featured nurses first", () => {
    const nurses = [
      card({ tier: "free", profile_completeness: 100 }),
      card({ tier: "featured", profile_completeness: 10 }),
    ];
    const ranked = rankNurses(nurses, null);
    expect(ranked[0].tier).toBe("featured");
  });

  it("prefers nurses with a photo at the same tier", () => {
    const nurses = [
      card({ has_photo: false, review_count: 50 }),
      card({ has_photo: true, review_count: 0 }),
    ];
    const ranked = rankNurses(nurses, null);
    expect(ranked[0].has_photo).toBe(true);
  });

  it("breaks photo+tier ties by review count", () => {
    const a = card({ has_photo: true, review_count: 5 });
    const b = card({ has_photo: true, review_count: 3 });
    const ranked = rankNurses([b, a], null);
    expect(ranked[0]).toBe(a);
  });

  it("breaks review count ties by rating", () => {
    const a = card({ has_photo: true, review_count: 5, avg_rating: 4.8 });
    const b = card({ has_photo: true, review_count: 5, avg_rating: 5.0 });
    const ranked = rankNurses([a, b], null);
    expect(ranked[0]).toBe(b);
  });

  it("falls back to profile_completeness when everything else ties", () => {
    const a = card({ profile_completeness: 90 });
    const b = card({ profile_completeness: 40 });
    const ranked = rankNurses([b, a], null);
    expect(ranked[0]).toBe(a);
  });

  it("boosts nurses whose communication preference matches the viewer's", () => {
    const emailNurse = card({
      communication_preference: "email",
      profile_completeness: 10,
    });
    const phoneNurse = card({
      communication_preference: "phone",
      profile_completeness: 90,
    });
    const ranked = rankNurses([phoneNurse, emailNurse], "email");
    expect(ranked[0]).toBe(emailNurse);
  });

  it("ignores comm preference when viewer has none", () => {
    const emailNurse = card({
      communication_preference: "email",
      profile_completeness: 10,
    });
    const phoneNurse = card({
      communication_preference: "phone",
      profile_completeness: 90,
    });
    const ranked = rankNurses([emailNurse, phoneNurse], null);
    expect(ranked[0]).toBe(phoneNurse);
  });

  it("treats null avg_rating as 0", () => {
    const a = card({ review_count: 1, avg_rating: null });
    const b = card({ review_count: 1, avg_rating: 1.0 });
    const ranked = rankNurses([a, b], null);
    expect(ranked[0]).toBe(b);
  });
});

describe("parseSearchParams", () => {
  it("parses an empty input to default filters", () => {
    const f = parseSearchParams({});
    expect(f.credential).toBeUndefined();
    expect(f.gender).toBe(GENDER_FILTER_ANY);
    expect(f.skills).toEqual([]);
    expect(f.languages).toEqual([]);
    expect(f.show_unavailable).toBe(false);
    expect(f.page).toBe(1);
    expect(isEmptyFilterSet(f)).toBe(true);
  });

  it("parses a single enum value", () => {
    const f = parseSearchParams({ credential: "rn", care_type: "elderly" });
    expect(f.credential).toBe("rn");
    expect(f.care_type).toBe("elderly");
    expect(isEmptyFilterSet(f)).toBe(false);
  });

  it("parses comma-separated arrays of enums, dropping unknown values", () => {
    const f = parseSearchParams({
      skills: "tracheostomy_care,feeding_tube,not_a_real_skill",
    });
    // An invalid entry drops the whole array per the schema's .catch([]),
    // so we fall back to empty rather than accepting a polluted list.
    expect(f.skills).toEqual([]);
  });

  it("parses a clean array of enums", () => {
    const f = parseSearchParams({
      skills: "tracheostomy_care,feeding_tube",
    });
    expect(f.skills).toEqual(["tracheostomy_care", "feeding_tube"]);
  });

  it("parses languages as free-form strings", () => {
    const f = parseSearchParams({ languages: "Spanish,Italian" });
    expect(f.languages).toEqual(["Spanish", "Italian"]);
  });

  it("rejects malformed zip codes", () => {
    const f = parseSearchParams({ zip: "1177" });
    expect(f.zip).toBeUndefined();
  });

  it("accepts a valid 5-digit zip", () => {
    const f = parseSearchParams({ zip: "11779" });
    expect(f.zip).toBe("11779");
  });

  it("parses numeric filters", () => {
    const f = parseSearchParams({
      rate_max: "40",
      experience_min: "5",
      distance: "25",
    });
    expect(f.rate_max).toBe(40);
    expect(f.experience_min).toBe(5);
    expect(f.distance).toBe(25);
  });

  it("coerces malformed numbers to undefined (not NaN)", () => {
    const f = parseSearchParams({ rate_max: "abc" });
    expect(f.rate_max).toBeUndefined();
  });

  it("coerces show_unavailable=true strings", () => {
    expect(
      parseSearchParams({ show_unavailable: "true" }).show_unavailable,
    ).toBe(true);
    expect(parseSearchParams({ show_unavailable: "1" }).show_unavailable).toBe(
      true,
    );
    expect(
      parseSearchParams({ show_unavailable: "yes" }).show_unavailable,
    ).toBe(false);
  });

  it("parses page as a positive integer, falling back to 1", () => {
    expect(parseSearchParams({ page: "3" }).page).toBe(3);
    expect(parseSearchParams({ page: "0" }).page).toBe(1);
    expect(parseSearchParams({ page: "-5" }).page).toBe(1);
    expect(parseSearchParams({ page: "xyz" }).page).toBe(1);
  });
});

describe("toURLSearchParams", () => {
  it("omits default and empty values", () => {
    const params = toURLSearchParams({
      gender: GENDER_FILTER_ANY,
      skills: [],
      page: 1,
    });
    expect(params.toString()).toBe("");
  });

  it("serializes arrays as comma-separated", () => {
    const params = toURLSearchParams({
      skills: [Skill.TRACHEOSTOMY_CARE, Skill.FEEDING_TUBE],
    });
    expect(params.get("skills")).toBe("tracheostomy_care,feeding_tube");
  });

  it("serializes and re-parses cleanly (round-trip)", () => {
    const filters = parseSearchParams({
      credential: "rn",
      skills: "tracheostomy_care,feeding_tube",
      rate_max: "45",
      zip: "11779",
      distance: "25",
      show_unavailable: "true",
      page: "2",
    });
    const round = parseSearchParams(
      Object.fromEntries(toURLSearchParams(filters)),
    );
    expect(round).toEqual(filters);
  });

  it("only includes gender when not 'any'", () => {
    expect(
      toURLSearchParams({ gender: GENDER_FILTER_ANY }).get("gender"),
    ).toBeNull();
    expect(toURLSearchParams({ gender: Gender.FEMALE }).get("gender")).toBe(
      "female",
    );
  });
});

describe("gender filter semantics", () => {
  it("defaults to 'any', which the search query treats as no filter", () => {
    const f = parseSearchParams({});
    expect(f.gender).toBe(GENDER_FILTER_ANY);
  });

  it("a specific selection (e.g., female) produces an exact-match filter", () => {
    // The runQuery function in search.ts applies .eq('gender', filter) only
    // when the value is not GENDER_FILTER_ANY, so nurses with
    // gender='prefer_not_to_say' are excluded from any specific selection.
    const f = parseSearchParams({ gender: "female" });
    expect(f.gender).toBe("female");
  });
});
