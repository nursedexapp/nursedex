import type { NextConfig } from "next";

// Upstream PostHog hosts for the reverse proxy below. Derived from the public
// host so US/EU clouds both work: us.i.posthog.com -> us-assets.i.posthog.com.
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetsHost = posthogHost.replace(
  ".i.posthog.com",
  "-assets.i.posthog.com",
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
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

export default nextConfig;
