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
 * What the upstream lookup found: an address to fetch, a definite "this video
 * has no preview" (absent, safe to cache), a lookup that went wrong (failed,
 * never cached), or an id or provider we will not look up (refused).
 */
export type ThumbnailUpstream =
  { url: string } | { absent: true } | { failed: true } | { refused: true };

/**
 * Where a video's preview image lives at its provider. Only ever three fixed
 * hosts (i.ytimg.com, vimeo.com, i.vimeocdn.com), with an id that passed the
 * same shape check parseEmbed uses, so nothing a caller sends can point this
 * at another server.
 */
export async function thumbnailUpstreamUrl(
  provider: string,
  id: string,
  fetchFn: FetchFn = deps.fetch,
): Promise<ThumbnailUpstream> {
  if (provider === "youtube") {
    return YT_ID.test(id)
      ? { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
      : { refused: true };
  }
  if (provider !== "vimeo" || !VIMEO_ID.test(id)) return { refused: true };
  const warn = (reason: string, err?: unknown) =>
    console.warn("[video-thumbnail] vimeo", id, reason, err ?? "");
  const fail = (reason: string, err?: unknown): ThumbnailUpstream => {
    warn(reason, err);
    return { failed: true };
  };
  try {
    const target = encodeURIComponent(`https://vimeo.com/${id}`);
    const res = await fetchFn(
      `https://vimeo.com/api/oembed.json?url=${target}&width=1280`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 404 || res.status === 403) {
      // Deleted, private or domain restricted: a definite answer, not a fault.
      warn(`oembed status ${res.status}`);
      return { absent: true };
    }
    if (!res.ok) return fail(`oembed status ${res.status}`);
    const body = (await res.json()) as { thumbnail_url?: unknown };
    if (typeof body.thumbnail_url !== "string") {
      return fail("oembed has no thumbnail_url");
    }
    const url = new URL(body.thumbnail_url);
    return url.protocol === "https:" && url.hostname === VIMEO_IMAGE_HOST
      ? { url: url.toString() }
      : fail("thumbnail_url off host", url.hostname);
  } catch (err) {
    return fail("oembed failed or unreadable", err);
  }
}
