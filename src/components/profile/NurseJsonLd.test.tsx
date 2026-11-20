// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NurseJsonLd } from "./NurseJsonLd";

function jsonLd(photoUrl: string | null): Record<string, unknown> {
  const markup = renderToStaticMarkup(
    <NurseJsonLd
      firstName="Avery"
      lastName=""
      credentialLabel="Registered Nurse"
      slug="avery-example-rn"
      bio={null}
      photoUrl={photoUrl}
      avgRating={null}
      reviewCount={0}
    />,
  );
  const json = markup.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  return JSON.parse(json);
}

describe("NurseJsonLd", () => {
  // The profile page hands over the stable photo route address, which starts
  // at the site root (#1321). A search engine reads this block away from the
  // page, where an address with no host names nothing.
  it("gives a search engine the photo's whole address, host included", () => {
    expect(jsonLd("/api/nurse-photo/abc123").image).toBe(
      "https://nursedex.com/api/nurse-photo/abc123",
    );
  });

  it("names no image for a nurse with no photo", () => {
    expect(jsonLd(null)).not.toHaveProperty("image");
  });
});
