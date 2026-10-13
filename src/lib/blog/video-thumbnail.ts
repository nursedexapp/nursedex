import { VIMEO_ID, YT_ID, type ParsedEmbed } from "./embed";

type Provider = ParsedEmbed["provider"];
type FetchFn = typeof fetch;

/** The seam route tests replace; production uses the platform fetch. */
export const deps: { fetch: FetchFn } = {
  fetch: (...args) => globalThis.fetch(...args),
};

const VIMEO_IMAGE_HOST = "i.vimeocdn.com";

export function videoThumbnailPath(provider: Provider, id: string): string {
  return `/api/video-thumbnail/${provider}/${id}`;
}

/**
 * Where a video's preview image lives at its provider, or null. Only ever two
 * fixed hosts, with an id that passed the same shape check parseEmbed uses,
 * so nothing a caller sends can point this at another server.
 */
export async function thumbnailUpstreamUrl(
  provider: string,
  id: string,
  fetchFn: FetchFn = deps.fetch,
): Promise<string | null> {
  if (provider === "youtube") {
    return YT_ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  }
  if (provider !== "vimeo" || !VIMEO_ID.test(id)) return null;
  try {
    const target = encodeURIComponent(`https://vimeo.com/${id}`);
    const res = await fetchFn(
      `https://vimeo.com/api/oembed.json?url=${target}&width=1280`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { thumbnail_url?: unknown };
    if (typeof body.thumbnail_url !== "string") return null;
    const url = new URL(body.thumbnail_url);
    return url.protocol === "https:" && url.hostname === VIMEO_IMAGE_HOST
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
