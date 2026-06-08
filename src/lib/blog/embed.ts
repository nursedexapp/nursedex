export interface ParsedEmbed {
  provider: "youtube" | "vimeo";
  embedUrl: string;
}

const YT_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;

/**
 * Validate and normalize an embeddable URL to a safe provider embed URL.
 *
 * Security model: we never iframe a user-supplied URL directly. We
 * allowlist a small set of providers, extract the video id, validate its
 * shape, and reconstruct the canonical embed URL ourselves. Anything that
 * does not match a known provider (or that uses a non-https scheme) returns
 * null, so the renderer drops it. Pure, so it is unit testable.
 */
export function parseEmbed(rawUrl: string | null | undefined): ParsedEmbed | null {
  if (typeof rawUrl !== "string") return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");

  // YouTube watch / embed
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && YT_ID.test(v)) {
      return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${v}` };
    }
    const embedMatch = url.pathname.match(/^\/embed\/([\w-]{11})$/);
    if (embedMatch) {
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/${embedMatch[1]}`,
      };
    }
    return null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    if (YT_ID.test(id)) {
      return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    return null;
  }

  // Vimeo
  if (host === "vimeo.com") {
    const id = url.pathname.split("/")[1] ?? "";
    if (VIMEO_ID.test(id)) {
      return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
    return null;
  }
  if (host === "player.vimeo.com") {
    const m = url.pathname.match(/^\/video\/(\d+)/);
    if (m) {
      return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}` };
    }
    return null;
  }

  return null;
}
