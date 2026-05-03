import type { Metadata } from "next";
import Link from "next/link";
import { Star, MessageSquare } from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNurseReviews } from "@/lib/reviews/queries";
import { NurseResponseForm } from "@/components/reviews/NurseResponseForm";
import { DisputeReviewDialog } from "@/components/reviews/DisputeReviewDialog";
import type { Review } from "@/types/database";

export const metadata: Metadata = {
  title: "Reviews | NurseDex",
};

export default async function ReviewsPage() {
  const user = await requireRole(UserRole.NURSE);
  const reviews = await getNurseReviews(user.id);

  const approved = reviews.filter((r) => r.status === "approved");
  const disputed = reviews.filter((r) => r.status === "disputed");
  const pending = reviews.filter(
    (r) => r.status === "pending" && r.email_verified,
  );

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          Reviews
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Public reviews on your profile, plus any waiting on moderation.
        </p>
      </header>

      {reviews.length === 0 && <EmptyState />}

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-soft-black mb-2 text-sm font-semibold">
            Awaiting moderation
          </h2>
          <div className="space-y-3">
            {pending.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                showResponseForm={false}
                showDisputeButton={false}
              />
            ))}
          </div>
        </section>
      )}

      {approved.length > 0 && (
        <section className="mb-8">
          <h2 className="text-soft-black mb-2 text-sm font-semibold">
            Published
          </h2>
          <div className="space-y-3">
            {approved.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                showResponseForm={true}
                showDisputeButton={true}
              />
            ))}
          </div>
        </section>
      )}

      {disputed.length > 0 && (
        <section>
          <h2 className="text-soft-black mb-2 text-sm font-semibold">
            Under investigation
          </h2>
          <div className="space-y-3">
            {disputed.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                showResponseForm={true}
                showDisputeButton={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-3 py-10 text-center">
        <div className="bg-teal/10 text-teal mx-auto flex size-12 items-center justify-center rounded-full">
          <MessageSquare className="size-6" aria-hidden="true" />
        </div>
        <h2 className="font-heading text-soft-black text-lg font-medium">
          No reviews yet
        </h2>
        <p className="text-soft-black-light mx-auto max-w-sm text-sm">
          Share your review link with past clients to start collecting
          reviews. You can find it on your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="text-teal hover:underline text-sm font-medium"
        >
          Go to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  review,
  showResponseForm,
  showDisputeButton,
}: {
  review: Review;
  showResponseForm: boolean;
  showDisputeButton: boolean;
}) {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-2 pt-4">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-sm font-medium">{review.reviewer_name}</span>
            {review.is_external && (
              <Badge
                variant="outline"
                className="border-sage/30 bg-sage/5 text-[10px]"
              >
                External
              </Badge>
            )}
            {review.status === "disputed" && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] text-amber-900"
              >
                Under review
              </Badge>
            )}
          </div>
          <time className="text-muted-foreground text-xs">
            {formatDate(review.created_at)}
          </time>
        </header>
        {review.text && (
          <p className="text-soft-black text-sm whitespace-pre-line">
            {review.text}
          </p>
        )}
        {review.nurse_response && (
          <div className="border-teal/20 bg-teal/5 rounded-md border p-3">
            <p className="text-muted-foreground mb-1 text-[11px] font-medium">
              Your response
            </p>
            <p className="text-soft-black text-sm whitespace-pre-line">
              {review.nurse_response}
            </p>
          </div>
        )}
        {(showResponseForm || showDisputeButton) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {showResponseForm && (
              <NurseResponseForm
                reviewId={review.id}
                existingResponse={review.nurse_response}
              />
            )}
            {showDisputeButton && (
              <DisputeReviewDialog reviewId={review.id} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating
              ? "size-4 fill-amber-400 text-amber-400"
              : "text-muted-foreground/40 size-4"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
