import type { MetadataRoute } from "next";

const BASE_URL = "https://nursedex.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/nurses", "/nurses/"],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/dashboard/",
          "/onboarding/",
          "/hires/",
          "/reviews/",
          "/brand",
          "/brand/",
          "/brand-login",
          "/logo-exploration",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
