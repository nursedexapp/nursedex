import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MessageSquare, Tags } from "lucide-react";
import { getAllPostsForAdmin } from "@/lib/blog/queries";
import { getPendingCommentCount } from "@/lib/comments/queries";
import { BLOG_POST_STATUS_LABELS, BlogPostStatus } from "@/types/enums";
import { BlogPostActions } from "@/components/admin/BlogPostActions";

export const metadata: Metadata = {
  title: "Blog | NurseDex Admin",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<BlogPostStatus, string> = {
  [BlogPostStatus.DRAFT]: "bg-muted text-soft-black-light",
  [BlogPostStatus.SCHEDULED]: "bg-cream-light text-cream-dark",
  [BlogPostStatus.PUBLISHED]: "bg-teal/10 text-teal-dark",
  [BlogPostStatus.ARCHIVED]: "bg-muted text-soft-black-light line-through",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminBlogPage() {
  const [posts, pendingComments] = await Promise.all([
    getAllPostsForAdmin(),
    getPendingCommentCount(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-soft-black text-2xl font-semibold">
            Blog
          </h1>
          <p className="text-soft-black-light mt-1 text-sm">
            Write, schedule, and publish posts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/blog/taxonomy"
            className={buttonVariants({ variant: "outline" })}
          >
            <Tags className="size-4" />
            Categories &amp; tags
          </Link>
          <Link
            href="/admin/blog/comments"
            className={buttonVariants({ variant: "outline" })}
          >
            <MessageSquare className="size-4" />
            Comments
            {pendingComments > 0 && (
              <span className="bg-teal ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white tabular-nums">
                {pendingComments}
              </span>
            )}
          </Link>
          <Link href="/admin/blog/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New post
          </Link>
        </div>
      </div>

      {posts.length === 0 ? (
        <Card className="border-sage/20">
          <CardContent className="text-soft-black-light py-12 text-center text-sm">
            No posts yet. Create your first one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Card key={post.id} className="border-sage/20">
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/blog/${post.id}/edit`}
                    className="hover:text-teal-dark block truncate font-medium"
                  >
                    {post.title || "Untitled"}
                  </Link>
                  <p className="text-soft-black-light mt-0.5 text-xs">
                    {post.status === BlogPostStatus.SCHEDULED
                      ? `Scheduled for ${formatDate(post.publish_at)}`
                      : post.status === BlogPostStatus.PUBLISHED
                        ? `Published ${formatDate(post.publish_at)}`
                        : `Updated ${formatDate(post.updated_at)}`}
                  </p>
                </div>
                {post.pinned && (
                  <Badge className="bg-cream-light text-cream-dark">
                    Featured
                  </Badge>
                )}
                <Badge className={STATUS_STYLES[post.status]}>
                  {BLOG_POST_STATUS_LABELS[post.status]}
                </Badge>
                <BlogPostActions
                  id={post.id}
                  status={post.status}
                  pinned={post.pinned}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
