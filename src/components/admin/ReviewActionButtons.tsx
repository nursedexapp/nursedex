"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adminApproveReview,
  adminRejectReview,
  adminResolveRemovalRequest,
} from "@/lib/admin/review-actions";

interface PendingActionsProps {
  reviewId: string;
}

export function PendingReviewActions({ reviewId }: PendingActionsProps) {
  const [pending, startTransition] = useTransition();

  const run = (
    fn: typeof adminApproveReview | typeof adminRejectReview,
    verb: string,
    done: string,
  ) => {
    startTransition(async () => {
      const result = await fn({ review_id: reviewId });
      if (!result.success) {
        toast.error(`Could not ${verb}. Please try again.`);
        return;
      }
      toast.success(done);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => run(adminApproveReview, "approve", "Approved")}
        disabled={pending}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => run(adminRejectReview, "reject", "Rejected")}
        disabled={pending}
      >
        Reject
      </Button>
    </div>
  );
}

interface RemovalActionsProps {
  reviewId: string;
}

export function RemovalRequestActions({ reviewId }: RemovalActionsProps) {
  const [pending, startTransition] = useTransition();

  const handle = (decision: "honor" | "deny") => {
    const verb =
      decision === "honor" ? "Removed and request honored" : "Request denied";
    startTransition(async () => {
      const result = await adminResolveRemovalRequest({
        review_id: reviewId,
        decision,
      });
      if (!result.success) {
        toast.error("Could not save the decision. Please try again.");
        return;
      }
      toast.success(verb);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="destructive"
        onClick={() => handle("honor")}
        disabled={pending}
      >
        Honor (remove)
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handle("deny")}
        disabled={pending}
      >
        Deny (keep)
      </Button>
    </div>
  );
}
