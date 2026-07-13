import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Upstream PostHog hosts for the reverse proxy below. Derived from the public
// host so US/EU clouds both work: us.i.posthog.com -> us-assets.i.posthog.com.
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetsHost = posthogHost.replace(
  ".i.posthog.com",
  "-assets.i.posthog.com",
);

// A nurse's photo is served from Supabase storage through a signed URL, and
// next/image refuses any host not listed here. Production is *.supabase.co; a
// local or CI stack is http://127.0.0.1:54321, which meant the profile page
// crashed with "hostname is not configured under images" the moment a photo
// actually existed, and so the onboarding journey could not be tested outside
// production (#485).
//
// Additive on purpose: the production pattern is untouched, and this only adds
// the host the app is really pointed at when that is somewhere else.
const localSupabaseImagePattern = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".supabase.co")) return []; // already covered

    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
})();

// Named export so tests can read the plain config without triggering
// withSentryConfig's build-time work (network calls for source-map
// upload); only the wrapped default export matters to Next.js itself.
export const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      ...localSupabaseImagePattern,
    ],
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
