import { NextResponse } from "next/server";
import { deps, thumbnailUpstreamUrl } from "@/lib/blog/video-thumbnail";

const RASTER = new Set(["image/jpeg", "image/png", "image/webp"]);
const NO_PREVIEW_CACHE = "public, s-maxage=3600";

/**
 * A blog video's preview image, served from NurseDex so a reader's browser
 * contacts neither YouTube nor Vimeo until they press play.
 *
 * WHO CALLS IT: anyone; it is a public image, like the pictures it stands in for.
 * WHAT IT TOUCHES: no user data. It fetches from i.ytimg.com, vimeo.com's
 * oEmbed and i.vimeocdn.com only, with an id checked against the same shape
 * parseEmbed uses, so it cannot be aimed elsewhere (no SSRF).
 * FAILURE: 404 with a warning in the logs, never a thrown error or a Sentry
 * alert, because anyone can trigger one at will (L498). The player falls back
 * to a plain panel. Redirects stay at the platform default, since Google and
 * Vimeo may legitimately redirect within their own CDNs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  const { provider, id } = await params;
  const found = await thumbnailUpstreamUrl(provider, id);
  // A video with no preview is as definite as the image host saying 404, so it
  // is cached the same way; a failed lookup or a refusal never is.
  if ("absent" in found) {
    return new NextResponse(null, {
      status: 404,
      headers: { "cache-control": NO_PREVIEW_CACHE },
    });
  }
  if (!("url" in found)) return new NextResponse(null, { status: 404 });
  try {
    const res = await deps.fetch(found.url, {
      signal: AbortSignal.timeout(5000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !RASTER.has(type.split(";")[0].trim().toLowerCase())) {
      console.warn(
        "[video-thumbnail] upstream refused",
        provider,
        id,
        res.status,
        type,
      );
      // Only a definite "no such preview" is cached; a timeout or odd status is not.
      return new NextResponse(null, {
        status: 404,
        headers:
          res.status === 404 ? { "cache-control": NO_PREVIEW_CACHE } : {},
      });
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.warn("[video-thumbnail] upstream failed", provider, id, err);
    return new NextResponse(null, { status: 404 });
  }
}
