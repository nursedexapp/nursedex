import { NextResponse } from "next/server";
import { deps, thumbnailUpstreamUrl } from "@/lib/blog/video-thumbnail";

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
 * to a plain panel.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  const { provider, id } = await params;
  const upstream = await thumbnailUpstreamUrl(provider, id);
  if (!upstream) return new NextResponse(null, { status: 404 });
  try {
    const res = await deps.fetch(upstream, { signal: AbortSignal.timeout(5000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      console.warn("[video-thumbnail] upstream refused", provider, id, res.status, type);
      return new NextResponse(null, { status: 404 });
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
