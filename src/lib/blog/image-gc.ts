import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { TiptapDoc } from "@/types/database";
import { BUCKET, collectImagePaths } from "./images";

/**
 * Every blog-images path referenced by any post (all statuses: drafts and
 * scheduled posts keep their images too). Used by the GC sweep as the set
 * of objects to preserve.
 */
export async function collectReferencedPaths(): Promise<Set<string>> {
  const supabase = createServiceRoleClient();
  const referenced = new Set<string>();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("cover_image_url, content");

  if (error) {
    // Surface to the caller so it can abort rather than risk deleting
    // images whose owning posts we failed to read.
    throw new Error(`failed to read posts: ${error.message}`);
  }

  for (const row of (data ?? []) as {
    cover_image_url: string | null;
    content: TiptapDoc | null;
  }[]) {
    for (const p of collectImagePaths(row)) referenced.add(p);
  }
  return referenced;
}

/**
 * List every object in the blog-images bucket with its path and creation
 * time. Walks nested folders (we store under blog/<year>/...), since the
 * storage list API only returns one level at a time.
 */
export async function listAllBlogImages(): Promise<
  { path: string; createdAt: string | null }[]
> {
  const supabase = createServiceRoleClient();
  const out: { path: string; createdAt: string | null }[] = [];
  const PAGE = 1000;

  async function walkDir(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { limit: PAGE, offset });
      if (error) {
        console.error("[blog] image GC list failed:", error.message);
        return;
      }
      if (!data || data.length === 0) return;
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Folder entries have a null id; files carry one.
        if (entry.id === null) {
          await walkDir(full);
        } else {
          out.push({ path: full, createdAt: entry.created_at ?? null });
        }
      }
      if (data.length < PAGE) return;
      offset += data.length;
    }
  }

  await walkDir("");
  return out;
}
