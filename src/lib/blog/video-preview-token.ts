import "server-only";
import {
  openToken,
  sealToken,
  type SealLabels,
} from "@/lib/security/sealed-token";
import type { TiptapDoc, TiptapNode } from "@/types/database";
import { parseEmbed, type ParsedEmbed } from "./embed";
import {
  videoPreviewKey,
  videoThumbnailPath,
  type VideoPreviews,
} from "./video-thumbnail";

/**
 * The server's signature on a blog video's preview, so the preview route
 * serves only videos NurseDex itself put in a post (L498). Without it, anyone
 * could use the route as a free YouTube and Vimeo thumbnail proxy at our
 * function and bandwidth cost.
 *
 * The same sealed token as nurse photos (src/lib/security/sealed-token.ts),
 * under labels of its own, over "provider/id". Deterministic, so a post's
 * preview URL is stable and the CDN cache holds. Signing needs
 * SUPABASE_SECRET_KEY, so it happens only on the server: the published post
 * page signs every video in the post before it renders.
 */

type Provider = ParsedEmbed["provider"];

const LABELS: SealLabels = {
  enc: "video-preview-token/enc/v1",
  iv: "video-preview-token/iv/v1",
  purpose: "blog video previews",
};

const subject = videoPreviewKey;

/** Throws without a key, like the photo token: never a URL nobody can verify. */
export function signVideoPreview(provider: Provider, id: string): string {
  return sealToken(subject(provider, id), LABELS);
}

/** Whether this token was signed for exactly this provider and id. */
export function videoPreviewIsSigned(
  provider: string,
  id: string,
  token: string | null,
): boolean {
  if (!token) return false;
  return openToken(token, LABELS) === subject(provider, id);
}

function collect(nodes: TiptapNode[] | undefined, found: ParsedEmbed[]) {
  for (const node of nodes ?? []) {
    if (node.type === "embed") {
      const parsed = parseEmbed(
        typeof node.attrs?.url === "string" ? node.attrs.url : null,
      );
      if (parsed) found.push(parsed);
    }
    collect(node.content, found);
  }
}

/**
 * A signed preview path for every video in a post. A post must still render
 * when signing is impossible (no key configured), so that is logged and the
 * videos show their plain panel instead of a preview.
 */
export function videoPreviewPaths(
  doc: TiptapDoc | null | undefined,
): VideoPreviews {
  const found: ParsedEmbed[] = [];
  collect(doc?.content, found);
  const paths: VideoPreviews = {};
  try {
    for (const { provider, id } of found) {
      paths[subject(provider, id)] = videoThumbnailPath(
        provider,
        id,
        signVideoPreview(provider, id),
      );
    }
  } catch (err) {
    console.error(
      "[video-preview] could not sign previews; videos show no preview",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
  return paths;
}
