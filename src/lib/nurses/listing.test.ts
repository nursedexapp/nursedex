// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  isListed,
  listingGaps,
  LISTED_MINIMUM_CONTENT,
  LISTED_CARE_TYPES_PRESENT,
  UNLISTED_FILTER,
} from "./listing";

/**
 * The listing rule exists in two forms that must agree: a PostgREST filter the
 * directory and sitemap query with, and a predicate the nurse's own dashboard
 * uses to tell her whether she is listed. Two forms of one rule is how the two
 * halves of a screen come to contradict each other, so they live in one module
 * and this table pins what each case does.
 *
 * The SQL arm's behaviour is measured, not assumed. Against production on
 * 2026-09-03 the listed filter matched 60 of the 100 visible profiles and the
 * unlisted filter matched 40, both before and after the care type condition
 * was added (#940), because every listed nurse already had a care type. The
 * condition removes nobody today; it stops a nurse being put in the directory
 * where the filter families narrow by cannot reach her.
 */
const CARE = ["elderly"];

const CASES = [
  {
    what: "a photo, a bio and a care type",
    has_photo: true,
    bio: "I love this work",
    care_types: CARE,
    listed: true,
  },
  {
    what: "a photo and a care type but no bio",
    has_photo: true,
    bio: null,
    care_types: CARE,
    listed: true,
  },
  {
    what: "a bio and a care type but no photo",
    has_photo: false,
    bio: "I love this work",
    care_types: CARE,
    listed: true,
  },
  {
    what: "nothing at all",
    has_photo: false,
    bio: null,
    care_types: [],
    listed: false,
  },
  {
    what: "an empty-string bio",
    has_photo: false,
    bio: "",
    care_types: CARE,
    listed: false,
  },
  {
    // The case #940 exists for: she has done the thing the nudge asks for and
    // is still unreachable by the only filter that narrows the directory.
    what: "a photo but no care type",
    has_photo: true,
    bio: "I love this work",
    care_types: [],
    listed: false,
  },
  {
    what: "a care type column that is null",
    has_photo: true,
    bio: "I love this work",
    care_types: null,
    listed: false,
  },
];

describe("isListed", () => {
  it.each(CASES)(
    "$what is listed=$listed",
    ({ has_photo, bio, care_types, listed }) => {
      expect(isListed({ has_photo, bio, care_types })).toBe(listed);
    },
  );

  it("is the same rule the directory query applies", () => {
    // SQL semantics: (has_photo IS TRUE OR bio <> '') AND care_types <> '{}'.
    // If either string changes, the predicate above has to change with it.
    expect(LISTED_MINIMUM_CONTENT).toBe("has_photo.eq.true,bio.neq.");
    expect(LISTED_CARE_TYPES_PRESENT).toEqual({
      column: "care_types",
      notEqualTo: "{}",
    });
  });
});

describe("listingGaps", () => {
  it("names nothing for a nurse the directory shows", () => {
    expect(
      listingGaps({ has_photo: true, bio: null, care_types: CARE }),
    ).toEqual([]);
  });

  it("names the missing content", () => {
    expect(
      listingGaps({ has_photo: false, bio: "", care_types: CARE }),
    ).toEqual(["content"]);
  });

  it("names the missing care type", () => {
    expect(listingGaps({ has_photo: true, bio: null, care_types: [] })).toEqual(
      ["care_type"],
    );
  });

  it("names both when both are missing", () => {
    expect(
      listingGaps({ has_photo: false, bio: null, care_types: [] }),
    ).toEqual(["content", "care_type"]);
  });

  // isListed is derived from this rather than written twice, so a surface
  // that tells her WHY cannot disagree with the one that tells her WHETHER.
  it.each(CASES)("agrees with isListed about $what", (c) => {
    const gaps = listingGaps(c);
    expect(gaps.length === 0).toBe(isListed(c));
  });
});

describe("the unlisted filter", () => {
  it("is the exact complement of the listed one", () => {
    // Measured against production on 2026-09-03: the listed filter matched 60
    // of the 100 visible profiles and this one matched 40, so the two
    // partition the roster with no overlap and no gap. Both shapes were run
    // against the live API before this was written, because PostgREST refuses
    // some nestings that read perfectly well.
    //
    // The empty-string arm matched 0 rows there, because no stored bio is
    // currently the empty string. It is carried anyway: without it a bio
    // saved as "" would be neither listed nor unlisted, and would fall out of
    // both the directory and the nudge, which is the one state nobody would
    // ever look for.
    expect(UNLISTED_FILTER).toBe(
      "and(has_photo.eq.false,or(bio.is.null,bio.eq.)),care_types.eq.{}",
    );
  });

  it.each(CASES)("$what is not both listed and unlisted", (c) => {
    const listed = isListed(c);
    const noContent = !c.has_photo && (c.bio === null || c.bio === "");
    const noCareType = !c.care_types || c.care_types.length === 0;
    const unlisted = noContent || noCareType;
    expect(listed).toBe(!unlisted);
  });
});
