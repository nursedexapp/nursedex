import { describe, it, expect, beforeAll } from "vitest";
import type { NextConfig } from "next";

let nextConfig: NextConfig;

beforeAll(async () => {
  // next.config.ts derives the upstream hosts from this at import time.
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  nextConfig = (await import("../../next.config")).default;
});

describe("PostHog reverse proxy", () => {
  it("forwards /ingest to PostHog and assets to the assets host", async () => {
    const rewrites = await (
      nextConfig.rewrites as () => Promise<
        Array<{ source: string; destination: string }>
      >
    )();

    const assets = rewrites.find((r) => r.source === "/ingest/static/:path*");
    const main = rewrites.find((r) => r.source === "/ingest/:path*");

    expect(assets?.destination).toBe(
      "https://us-assets.i.posthog.com/static/:path*",
    );
    expect(main?.destination).toBe("https://us.i.posthog.com/:path*");
  });

  it("disables trailing-slash redirects so proxied paths aren't broken", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });
});
