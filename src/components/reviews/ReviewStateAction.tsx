"use client";

import { Badge } from "@/components/ui/badge";
import { ReviewFormDialog } from "./ReviewFormDialog";
import { RemovalRequestDialog } from "./RemovalRequestDialog";
import type { Review } from "@/types/database";

interface ReviewStateActionProps {
  nurseUserId: string;
  nurseFirstName: string;
  defaultFirstName: string;
  review: Review | null;
}

/**
 * Renders the right CTA for a family's relationship to a nurse's review:
 * - No review yet:        "Leave a review" button
 * - Pending:              status badge + "Edit" button
 * - Approved:             "Published" badge + "Request removal" link
 * - Approved + requested: "Removal requested" badge
 * - Rejected:             info badge only
 * - Disputed:             info badge only (Batch 4 wires the action)
 */
export function ReviewStateAction({
  nurseUserId,
  nurseFirstName,
  defaultFirstName,
  review,
}: ReviewStateActionProps) {
  if (!review) {
    return (
      <ReviewFormDialog
        nurseUserId={nurseUserId}
        nurseFirstName={nurseFirstName}
        defaultFirstName={defaultFirstName}
        triggerLabel="Leave a review"
        triggerVariant="outline"
        triggerClassName="w-full inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted hover:text-foreground"
      />
    );
  }

  if (review.status === "pending") {
    return (
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-900"
        >
          Pending approval
        </Badge>
        <ReviewFormDialog
          nurseUserId={nurseUserId}
          nurseFirstName={nurseFirstName}
          defaultFirstName={defaultFirstName}
          triggerLabel="Edit"
          triggerVariant="ghost"
          triggerSize="sm"
          initial={{
            reviewId: review.id,
            rating: review.rating,
            text: review.text,
            reviewer_name: review.reviewer_name,
            testimonial_opt_in: review.testimonial_opt_in,
          }}
        />
      </div>
    );
  }

  if (review.status === "approved") {
    if (review.removal_requested) {
      return (
        <Badge
          variant="outline"
          className="border-sage/40 bg-sage/10 text-sage-dark"
        >
          Removal requested
        </Badge>
      );
    }
    return (
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className="border-teal/30 bg-teal/5 text-teal-dark"
        >
          Published
        </Badge>
        <RemovalRequestDialog
          reviewId={review.id}
          triggerLabel="Request removal"
          triggerVariant="ghost"
          triggerSize="sm"
        />
      </div>
    );
  }

  if (review.status === "rejected") {
    return (
      <Badge
        variant="outline"
        className="border-muted bg-muted/30 text-muted-foreground"
      >
        Not approved
      </Badge>
    );
  }

  // disputed
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-900"
    >
      Under review
    </Badge>
  );
}
