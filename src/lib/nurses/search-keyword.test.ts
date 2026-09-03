import { describe, it, expect } from "vitest";
import {
  parseSearchParams,
  toURLSearchParams,
  isEmptyFilterSet,
} from "./search-params";
import { keywordPattern, matchesNurseName } from "./search-keyword";

/**
 * #729. The directory has no free text search, so a family who was given a
 * nurse's name, or who wants somebody whose bio mentions dementia, has no way
 * to type it.
 */

describe("the keyword parameter", () => {
  it("carries what the family typed", () => {
    expect(parseSearchParams({ q: "dementia" }).q).toBe("dementia");
  });

  it("trims it, so a stray space is not a different search", () => {
    expect(parseSearchParams({ q: "  dementia  " }).q).toBe("dementia");
  });

  it("treats an empty box as no keyword at all", () => {
    expect(parseSearchParams({ q: "   " }).q).toBeUndefined();
  });

  it("survives a round trip through the URL", () => {
    const filters = parseSearchParams({ q: "ventilator care" });
    expect(toURLSearchParams(filters).get("q")).toBe("ventilator care");
  });

  it("counts as a filter, so an empty result is not read as an empty directory", () => {
    expect(isEmptyFilterSet(parseSearchParams({ q: "dementia" }))).toBe(false);
  });
});

describe("keywordPattern", () => {
  it("matches the word anywhere in the text", () => {
    expect(keywordPattern("dementia")).toBe("*dementia*");
  });

  it("drops the wildcard characters, so a typed % is not a match-everything", () => {
    // PostgREST reads * as the LIKE wildcard and passes % and _ through to
    // SQL, so a family typing "100%" would otherwise search for anything.
    expect(keywordPattern("100%")).toBe("*100*");
    expect(keywordPattern("a_b")).toBe("*ab*");
    expect(keywordPattern("a*b")).toBe("*ab*");
  });

  it("drops a backslash, which SQL LIKE reads as an escape", () => {
    expect(keywordPattern("a\\b")).toBe("*ab*");
  });

  it("refuses a keyword that is nothing but wildcards", () => {
    // Otherwise it becomes "**", which matches every nurse and reads to the
    // family as though her search was ignored.
    expect(keywordPattern("%%%")).toBeNull();
    expect(keywordPattern("")).toBeNull();
  });

  it("caps the length, since nobody searches a directory with a paragraph", () => {
    const long = "a".repeat(200);
    expect(keywordPattern(long)).toBe(`*${"a".repeat(60)}*`);
  });
});

describe("matchesNurseName", () => {
  const nurse = { first_name: "Marisol", last_name: "Okonkwo" };

  it("matches a first name however it was capitalised", () => {
    expect(matchesNurseName(nurse, "mari", { canSeeIdentity: false })).toBe(true);
  });

  it("does not match a last name for a viewer who is not shown last names", () => {
    // Cards strip the last name for an unsubscribed viewer (#381). Letting
    // her SEARCH it would hand back the same fact by guessing: a hit confirms
    // the spelling of a name she was never shown.
    expect(matchesNurseName(nurse, "okonkwo", { canSeeIdentity: false })).toBe(
      false,
    );
  });

  it("matches a last name for a viewer who is already shown it", () => {
    expect(matchesNurseName(nurse, "okonkwo", { canSeeIdentity: true })).toBe(
      true,
    );
  });

  it("does not match on a nurse with no name recorded", () => {
    expect(
      matchesNurseName({ first_name: null, last_name: null }, "mari", {
        canSeeIdentity: true,
      }),
    ).toBe(false);
  });
});
