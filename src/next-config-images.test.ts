// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import type { NextConfig } from "next";

/**
 * There was no test on images.remotePatterns at all until #740, which is what
 * made next.config.ts dangerous rather than merely untidy: the config held a
 * hardcoded `*.supabase.co` wildcard and an early return that existed only
 * because of it, and deleting either one alone left remotePatterns EMPTY. A
 * remotePatterns miss throws inside next/image rather than degrading, so an
 * empty list takes down nurse search (src/components/nurses/NurseCard.tsx) and
 * every sized blog image (src/lib/blog/render.tsx) at once.
 *
 * next.config.ts derives remotePatterns once, at module scope, because that is
 * what Next.js reads. So each env state needs its own fresh import.
 */
async function remotePatternsFor(
  raw: string | undefined,
): Promise<NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>> {
  vi.resetModules();
  if (raw === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = raw;
  }
  // The named export, not the wrapped default: withSentryConfig does
  // build-time work that has no place in a unit test.
  const { nextConfig } = await import("../next.config");
  return nextConfig.images?.remotePatterns ?? [];
}

const ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PRODUCTION = "https://fisuhtkzhyttdmqoivlp.supabase.co";
const LOCAL = "http://127.0.0.1:54321";

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL;
  }
  vi.resetModules();
});

describe("next.config images.remotePatterns", () => {
  it.each([
    ["production", PRODUCTION],
    ["a local stack", LOCAL],
    ["nothing configured", undefined],
  ])("is never empty with %s", async (_label, raw) => {
    expect((await remotePatternsFor(raw)).length).toBeGreaterThan(0);
  });

  it("narrows production to this project alone", async () => {
    const patterns = await remotePatternsFor(PRODUCTION);
    expect(patterns.map((p) => p.hostname)).toEqual([
      "fisuhtkzhyttdmqoivlp.supabase.co",
    ]);
  });

  it("stops trusting every other Supabase tenant's storage", async () => {
    const patterns = await remotePatternsFor(PRODUCTION);
    expect(patterns.map((p) => p.hostname)).not.toContain("*.supabase.co");
  });

  it("covers a local stack so photos can be exercised outside production", async () => {
    const patterns = await remotePatternsFor(LOCAL);
    expect(patterns).toEqual([
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**",
      },
    ]);
  });

  it("falls open to the wildcard rather than to nothing", async () => {
    expect(await remotePatternsFor(undefined)).toEqual([
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ]);
  });
});
