import { describe, it, expect } from "vitest";
import {
  LEGACY_SUPABASE_HOST,
  LEGACY_PROJECT_REF,
  collectLegacyImageUrls,
  evaluateLegacyHost,
  formatLegacyHostReport,
} from "./legacy-host";

// #744. The app was deliberately NOT migrated onto the custom domain (#741
// closed as not needed), so every database read, storage object and API call
// still goes to the original project host, permanently. Published blog images
// additionally have that host baked into them as absolute URLs.
//
// The whole arrangement rests on Supabase's documented promise that the project
// domain "continues to work" after a custom domain is activated. That promise
// was measured once, during activation, and nothing watches it since. This is
// what watches it.

const LEGACY = `https://${LEGACY_SUPABASE_HOST}`;
const cover = (host: string) =>
  `${host}/storage/v1/object/public/blog-images/blog/2026/abc.jpg`;

describe("collectLegacyImageUrls", () => {
  it("finds published covers that live on the legacy host", () => {
    const urls = collectLegacyImageUrls([
      { cover_image_url: cover(LEGACY) },
      { cover_image_url: cover("https://auth.nursedex.com") },
      { cover_image_url: null },
    ]);

    expect(urls).toEqual([cover(LEGACY)]);
  });

  // The failure this exists to prevent: a check that finds nothing to look at
  // and reports a healthy legacy host. Silence must never read as an all clear.
  it("REFUSES rather than returning empty when nothing is on the legacy host", () => {
    expect(() =>
      collectLegacyImageUrls([{ cover_image_url: cover("https://elsewhere") }]),
    ).toThrow(/no blog image on the legacy host/i);
  });

  it("refuses on an empty post list too", () => {
    // Distinct from the case above: no posts at all, versus posts that have all
    // moved. Both must refuse, and neither may be mistaken for a pass.
    expect(() => collectLegacyImageUrls([])).toThrow(/no posts/i);
  });
});

const objectOk = { kind: "object" as const, url: cover(LEGACY), status: 200 };
const identityOk = {
  kind: "identity" as const,
  url: `${LEGACY}/auth/v1/health`,
  status: 401,
  projectRef: LEGACY_PROJECT_REF,
};

describe("evaluateLegacyHost", () => {
  it("is ok when the images serve and the host identifies as our project", () => {
    const result = evaluateLegacyHost([objectOk, identityOk]);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  // Measured 2026-08-21: /auth/v1/health with no apikey returns 401 and still
  // carries sb-project-ref. That header is stronger evidence than a 200 status,
  // because it proves WHICH project answered, and it needs no credential. Judging
  // this probe by status would fail forever on a perfectly healthy host.
  it("accepts a 401 on the identity probe, because the fingerprint is the point", () => {
    expect(evaluateLegacyHost([objectOk, identityOk]).ok).toBe(true);
  });

  it("is NOT ok when something else answers on our host's name", () => {
    // The negative control, measured: a non-Supabase host returns 404 and no
    // sb-project-ref at all. A 200 from the wrong thing must not pass.
    const result = evaluateLegacyHost([
      objectOk,
      { ...identityOk, status: 200, projectRef: null },
    ]);

    expect(result.ok).toBe(false);
  });

  it("is NOT ok when a DIFFERENT Supabase project answers", () => {
    const result = evaluateLegacyHost([
      objectOk,
      { ...identityOk, projectRef: "someoneelsesproject" },
    ]);

    expect(result.ok).toBe(false);
  });

  it("is NOT ok when the legacy host stops serving an image", () => {
    const result = evaluateLegacyHost([
      { ...objectOk, status: 404 },
      identityOk,
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].url).toBe(cover(LEGACY));
  });

  it("is NOT ok when nothing was checked", () => {
    // An empty result set is the shape a broken caller produces, and it would
    // otherwise satisfy "every check passed" vacuously.
    expect(evaluateLegacyHost([]).ok).toBe(false);
  });

  it("treats a network failure as a failure, not as a pass", () => {
    const result = evaluateLegacyHost([
      { ...objectOk, status: null, error: "getaddrinfo ENOTFOUND" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures[0].error).toContain("ENOTFOUND");
  });
});

describe("formatLegacyHostReport", () => {
  it("names what broke and why it matters, not just that something failed", () => {
    const report = formatLegacyHostReport(
      evaluateLegacyHost([
        { kind: "object" as const, url: cover(LEGACY), status: 404 },
      ]),
    );

    expect(report).toContain(cover(LEGACY));
    expect(report).toContain("404");
    // A person paged by this needs to know the consequence, not only the symptom.
    expect(report).toMatch(/blog image|no longer serving|legacy/i);
  });
});
