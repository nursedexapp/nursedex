import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TiptapDoc, TiptapNode } from "@/types/database";

export const BUCKET = "blog-images";
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Public URLs look like
// {SUPABASE_URL}/storage/v1/object/public/blog-images/<path>. We only ever
// act on paths inside our own bucket, so anything not matching this prefix
// (an external image, a malformed value) is ignored.
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

// Magic bytes for allowed image types (same set as nurse photos).
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header
};

const EXT_BY_MAGIC: Array<{ magic: number[]; ext: string }> = [
  { magic: MAGIC_BYTES["image/jpeg"], ext: "jpg" },
  { magic: MAGIC_BYTES["image/png"], ext: "png" },
  { magic: MAGIC_BYTES["image/webp"], ext: "webp" },
];

/**
 * True when the leading bytes match a JPEG, PNG, or WebP header. Pure, so
 * it is unit testable without touching storage.
 */
export function hasValidImageMagic(bytes: Uint8Array): boolean {
  return Object.values(MAGIC_BYTES).some((magic) =>
    magic.every((byte, i) => bytes[i] === byte),
  );
}

function extFor(bytes: Uint8Array): string {
  return EXT_BY_MAGIC.find((e) => e.magic.every((b, i) => bytes[i] === b))?.ext ?? "jpg";
}

/**
 * Upload a blog image to the public blog-images bucket and return its
 * permanent public URL. Validates the file's magic bytes and size in
 * process before writing. Uses the user client so the admin-only storage
 * RLS authorizes the write; callers must already be an admin (the upload
 * route gates with requireAdmin()).
 */
export async function uploadBlogImage(
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (file.size > BLOG_IMAGE_MAX_BYTES) {
    return { error: "Image exceeds the 5MB size limit." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageMagic(bytes)) {
    return { error: "File is not a valid image (JPG, PNG, or WebP)." };
  }

  const year = new Date().getFullYear();
  const path = `blog/${year}/${Date.now()}-${crypto.randomUUID()}.${extFor(bytes)}`;

  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.error("[blog] image upload failed:", error.message);
    return { error: "Could not upload the image. Please try again." };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Extract the storage object path from a blog-images public URL. Returns
 * null for anything that is not a public URL in our bucket (external
 * images, empty values). Pure, so it is unit testable.
 */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return null;
  const raw = url.slice(idx + PUBLIC_URL_MARKER.length).split(/[?#]/)[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function walkNodes(node: TiptapNode | undefined, visit: (n: TiptapNode) => void) {
  if (!node) return;
  visit(node);
  for (const child of node.content ?? []) walkNodes(child, visit);
}

/**
 * Every blog-images storage path a post references: its cover image plus
 * any inline images embedded in the Tiptap body. Pure, so it is unit
 * testable and is the single source of truth for "what does this post
 * use" (shared by delete cleanup and the GC sweep).
 */
export function collectImagePaths(post: {
  cover_image_url?: string | null;
  content?: TiptapDoc | null;
}): string[] {
  const paths = new Set<string>();
  const cover = pathFromPublicUrl(post.cover_image_url);
  if (cover) paths.add(cover);

  for (const node of post.content?.content ?? []) {
    walkNodes(node, (n) => {
      if (n.type === "image") {
        const p = pathFromPublicUrl(
          typeof n.attrs?.src === "string" ? n.attrs.src : null,
        );
        if (p) paths.add(p);
      }
    });
  }
  return [...paths];
}

/**
 * Choose which stored objects are safe to delete: those not referenced by
 * any post and older than the grace window. The grace window protects
 * images an admin has just uploaded into the editor but not yet saved to a
 * post. Pure, so it is unit testable.
 */
export function selectOrphanedPaths(
  objects: { path: string; createdAt: string | null }[],
  referenced: Set<string>,
  nowMs: number,
  graceMs: number,
): string[] {
  return objects
    .filter((o) => !referenced.has(o.path))
    .filter((o) => {
      if (!o.createdAt) return false; // unknown age: keep, to be safe
      const age = nowMs - new Date(o.createdAt).getTime();
      return Number.isFinite(age) && age >= graceMs;
    })
    .map((o) => o.path);
}

/**
 * Remove objects from the blog-images bucket. Best effort: callers log but
 * do not fail their main operation if cleanup fails. Accepts whichever
 * client the caller already has (admin user client on delete, service-role
 * client in the GC cron).
 */
export async function removeBlogImagePaths(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error("[blog] image cleanup failed:", error.message);
  }
}
