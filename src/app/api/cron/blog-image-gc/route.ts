import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  collectReferencedPaths,
  listAllBlogImages,
} from "@/lib/blog/image-gc";
import { selectOrphanedPaths, removeBlogImagePaths } from "@/lib/blog/images";

export const runtime = "nodejs";
export const maxDuration = 60;

// Keep recently uploaded objects even if no post references them yet: an
// admin may have uploaded an image into the editor but not saved the post.
const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Daily. Reconciles the blog-images bucket against every post and deletes
 * objects that no post references and that are older than the grace
 * window. This catches images orphaned by a deleted post, a replaced
 * cover, or a removed inline image. If we cannot read the posts we abort
 * (better to leak storage than delete a live post's image).
 */
export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;

  let referenced: Set<string>;
  try {
    referenced = await collectReferencedPaths();
  } catch (err) {
    console.error("[cron] blog-image-gc aborted:", err);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const objects = await listAllBlogImages();
  const orphans = selectOrphanedPaths(
    objects,
    referenced,
    Date.now(),
    GRACE_MS,
  );

  if (orphans.length > 0) {
    const supabase = createServiceRoleClient();
    await removeBlogImagePaths(supabase, orphans);
  }

  return NextResponse.json({ scanned: objects.length, removed: orphans.length });
}
