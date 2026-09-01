import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
// Relative, not the "@/" alias: Next compiles this config file without
// applying tsconfig paths.
import { supabaseImageRemotePatterns } from "./src/lib/supabase/trusted-hosts";

// Upstream PostHog hosts for the reverse proxy below. Derived from the public
// host so US/EU clouds both work: us.i.posthog.com -> us-assets.i.posthog.com.
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetsHost = posthogHost.replace(
  ".i.posthog.com",
  "-assets.i.posthog.com",
);

// A nurse's photo and every blog image are served from Supabase storage, and
// next/image refuses any host not listed here, by throwing rather than
// degrading. Both the host list and the fail-open fallback live in one module
// shared with the CSP and the blog renderer (#740); see the notes there for
// why an empty list is not an option. src/next-config-images.test.ts holds it.

// Named export so tests can read the plain config without triggering
// withSentryConfig's build-time work (network calls for source-map
// upload); only the wrapped default export matters to Next.js itself.
export const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImageRemotePatterns(),
  },
  // PostHog reverse proxy: serve analytics from our own origin so ad blockers
  // (which blocklist *.posthog.com) can't silently drop pageviews. The client
  // points api_host at /ingest; these rewrites forward to PostHog.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogAssetsHost}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogHost}/:path*`,
      },
    ];
  },
  // PostHog ingestion paths are trailing-slash sensitive; don't let Next
  // 308-redirect them and break the proxied requests.
  skipTrailingSlashRedirect: true,
};

// Wraps the config with a build-time plugin that uploads source maps
// (when SENTRY_AUTH_TOKEN is set) and injects Next.js instrumentation.
// Without this, sentry.server.config.ts/sentry.edge.config.ts are never
// loaded and every server/edge Sentry.captureException call no-ops (#394).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
