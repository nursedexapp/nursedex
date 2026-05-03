import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ApprovedReview } from "@/lib/reviews/queries";

interface ReviewListProps {
  nurseFirstName: string;
  reviews: ApprovedReview[];
}

export function ReviewList({ nurseFirstName, reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <Card className="border-sage/20">
        <CardContent className="text-muted-foreground py-6 text-center text-sm">
          No reviews yet. Be the first to share your experience after working
          with {nurseFirstName}.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <Card key={review.id} className="border-sage/20">
          <CardContent className="space-y-2 pt-4">
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stars rating={review.rating} />
                <span className="text-sm font-medium">
                  {review.reviewer_name}
                </span>
                {review.is_disputed && (
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
              <div className="border-teal/20 bg-teal/5 mt-2 rounded-md border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-teal/30 bg-teal/10 text-teal-dark text-[10px]"
                  >
                    Response from {nurseFirstName}
                  </Badge>
                  {review.nurse_response_at && (
                    <span className="text-muted-foreground text-[11px]">
                      {formatDate(review.nurse_response_at)}
                    </span>
                  )}
                </div>
                <p className="text-soft-black text-sm whitespace-pre-line">
                  {review.nurse_response}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
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
