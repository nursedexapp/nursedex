import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyCronAuth } from "@/lib/cron/auth";
import { withCronAlerting } from "@/lib/cron/alerting";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hourly. Flips scheduled posts whose publish_at has passed to published,
 * then revalidates the public blog surfaces so they appear immediately.
 * Scheduled posts with a future publish_at are left untouched.
 */
const handlePublishScheduledPosts = withCronAlerting(
  "publish-scheduled-posts",
  async (_request: NextRequest) => {
    const supabase = createServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("blog_posts")
      .update({ status: "published" })
      .eq("status", "scheduled")
      .lte("publish_at", nowIso)
      .select("slug");

    if (error) {
      console.error("[cron] publish-scheduled-posts failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    const published = (data ?? []) as { slug: string }[];
    if (published.length > 0) {
      revalidatePath("/blog");
      revalidatePath("/sitemap.xml");
      for (const p of published) revalidatePath(`/blog/${p.slug}`);
    }

    return NextResponse.json({ published: published.length });
  },
);

export async function GET(request: NextRequest) {
  const unauth = verifyCronAuth(request);
  if (unauth) return unauth;
  return handlePublishScheduledPosts(request);
}
