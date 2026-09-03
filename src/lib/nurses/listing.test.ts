// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  isListed,
  LISTED_MINIMUM_CONTENT,
  UNLISTED_EMPTY_BIO,
} from "./listing";

/**
 * The listing rule exists in two forms that must agree: a PostgREST filter the
 * directory and sitemap query with, and a predicate the nurse's own dashboard
 * uses to tell her whether she is listed. Two forms of one rule is how the two
 * halves of a screen come to contradict each other, so they live in one module
 * and this table pins what each case does.
 *
 * The SQL arm's behaviour is measured, not assumed: against production on
 * 2026-09-03 the filter matched 60 of the 100 visible profiles, and a control
 * (has_photo.eq.false OR bio.neq.) returned 100, which is 40 without a photo
 * plus 60 with a real bio. So the bio arm genuinely matches rather than being
 * silently dead.
 */
const CASES = [
  { what: "a photo and a bio", has_photo: true, bio: "I love this work", listed: true },
  { what: "a photo but no bio", has_photo: true, bio: null, listed: true },
  { what: "a bio but no photo", has_photo: false, bio: "I love this work", listed: true },
  { what: "nothing at all", has_photo: false, bio: null, listed: false },
  { what: "an empty-string bio", has_photo: false, bio: "", listed: false },
];

describe("isListed", () => {
  it.each(CASES)("$what is listed=$listed", ({ has_photo, bio, listed }) => {
    expect(isListed({ has_photo, bio })).toBe(listed);
  });

  it("is the same rule the directory query applies", () => {
    // SQL semantics: has_photo IS TRUE OR bio <> ''. If this string changes,
    // the predicate above has to change with it.
    expect(LISTED_MINIMUM_CONTENT).toBe("has_photo.eq.true,bio.neq.");
  });
});

describe("the unlisted filter", () => {
  it("is the exact complement of the listed one", () => {
    // Measured against production on 2026-09-03: the listed filter matched 60
    // of the 100 visible profiles and this one matched 40, so the two
    // partition the roster with no overlap and no gap.
    //
    // The empty-string arm matched 0 rows there, because no stored bio is
    // currently the empty string. It is carried anyway: without it a bio
    // saved as "" would be neither listed nor unlisted, and would fall out of
    // both the directory and the nudge, which is the one state nobody would
    // ever look for.
    expect(UNLISTED_EMPTY_BIO).toBe("bio.is.null,bio.eq.");
  });

  it.each(CASES)("$what is not both listed and unlisted", (c) => {
    const listed = isListed({ has_photo: c.has_photo, bio: c.bio });
    const unlisted = !c.has_photo && (c.bio === null || c.bio === "");
    expect(listed).toBe(!unlisted);
  });
});
