import { createClient } from "@/lib/supabase/server";

const BUCKET = "blog-images";
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

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
