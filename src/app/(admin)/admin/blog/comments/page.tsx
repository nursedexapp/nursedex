import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCommentsForAdmin } from "@/lib/comments/queries";
import { CommentModerationActions } from "@/components/admin/CommentModerationActions";
import { BlogCommentStatus } from "@/types/enums";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Comments | NurseDex Admin",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<BlogCommentStatus, string> = {
  [BlogCommentStatus.PENDING]: "bg-cream-light text-cream-dark",
  [BlogCommentStatus.APPROVED]: "bg-teal/10 text-teal-dark",
  [BlogCommentStatus.REJECTED]: "bg-muted text-soft-black-light line-through",
};

const STATUS_ORDER: Record<BlogCommentStatus, number> = {
  [BlogCommentStatus.PENDING]: 0,
  [BlogCommentStatus.APPROVED]: 1,
  [BlogCommentStatus.REJECTED]: 2,
};

const LABELS: Record<BlogCommentStatus, string> = {
  [BlogCommentStatus.PENDING]: "Pending",
  [BlogCommentStatus.APPROVED]: "Approved",
  [BlogCommentStatus.REJECTED]: "Rejected",
};

// Filter tabs. Defaults to pending so approving/rejecting clears a comment
// from the working queue while it stays findable under its status.
const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CommentsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminBlogCommentsPage({
  searchParams,
}: CommentsPageProps) {
  const { status } = await searchParams;
  const active: Filter = FILTERS.includes(status as Filter)
    ? (status as Filter)
    : "pending";

  const comments = await getCommentsForAdmin();
  const counts: Record<Filter, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    all: comments.length,
  };
  for (const c of comments) counts[c.status] += 1;

  const visible = (
    active === "all" ? comments : comments.filter((c) => c.status === active)
  ).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <Link
        href="/admin/blog"
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to posts
      </Link>
      <h1 className="font-heading text-soft-black mb-4 text-2xl font-semibold">
        Comments
      </h1>

      <div className="border-sage/20 mb-6 flex flex-wrap gap-1 border-b">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "pending" ? "/admin/blog/comments" : `?status=${f}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active === f
                ? "border-teal text-teal-dark font-medium"
                : "text-soft-black-light hover:text-foreground border-transparent",
            )}
          >
            {FILTER_LABELS[f]}
            <span className="text-soft-black-light ml-1 tabular-nums">
              {counts[f]}
            </span>
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="border-sage/20">
          <CardContent className="text-soft-black-light py-12 text-center text-sm">
            {active === "pending"
              ? "Nothing waiting for moderation."
              : `No ${active === "all" ? "" : FILTER_LABELS[active].toLowerCase() + " "}comments.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <Card key={c.id} className="border-sage/20">
              <CardContent className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-soft-black-light flex items-center gap-2 text-sm">
                    <span className="text-soft-black font-medium">
                      {c.author_name}
                    </span>
                    <span className="truncate">{c.author_email}</span>
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                  <p className="text-soft-black mt-1 text-sm whitespace-pre-wrap">
                    {c.body}
                  </p>
                </div>
                <Badge className={STATUS_STYLES[c.status]}>
                  {LABELS[c.status]}
                </Badge>
                <CommentModerationActions id={c.id} status={c.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
