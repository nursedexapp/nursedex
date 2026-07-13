"use client";

import { toast } from "sonner";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
import {
  adminApproveReview,
  adminRejectReview,
  adminResolveRemovalRequest,
} from "@/lib/admin/review-actions";

// wait, not retry (#443 phase 4). Approving publishes a review on a nurse's
// public profile and rejecting takes it down, so a second fire re-runs a real
// moderation decision. See VerificationRowActions for why the #652 guard does
// not yet make these safe to retry (#669).

interface PendingActionsProps {
  reviewId: string;
}

export function PendingReviewActions({ reviewId }: PendingActionsProps) {
  // Keyed, not a single flag: one flag put the working label on the button the
  // admin never pressed.
  const { inFlight, busy, run } = useInFlight<"approve" | "reject">();

  const decide = (
    key: "approve" | "reject",
    fn: typeof adminApproveReview | typeof adminRejectReview,
    verb: string,
    done: string,
  ) =>
    run(key, async () => {
      const result = await fn({ review_id: reviewId });
      if (!result.success) {
        toast.error(`Could not ${verb}. Please try again.`);
        return;
      }
      toast.success(done);
    });

  return (
    <div className="flex items-end gap-2">
      <PendingButton
        pending={inFlight === "approve"}
        mode="wait"
        idleLabel="Approve"
        workingLabel="Approving..."
        slowLabel="Still approving..."
        outcome="the review was approved"
        disabled={busy}
        onClick={() =>
          decide("approve", adminApproveReview, "approve", "Approved")
        }
      />
      <PendingButton
        pending={inFlight === "reject"}
        mode="wait"
        variant="outline"
        idleLabel="Reject"
        workingLabel="Rejecting..."
        slowLabel="Still rejecting..."
        outcome="the review was rejected"
        disabled={busy}
        onClick={() =>
          decide("reject", adminRejectReview, "reject", "Rejected")
        }
      />
    </div>
  );
}

interface RemovalActionsProps {
  reviewId: string;
}

export function RemovalRequestActions({ reviewId }: RemovalActionsProps) {
  const { inFlight, busy, run } = useInFlight<"honor" | "deny">();

  const handle = (decision: "honor" | "deny") =>
    run(decision, async () => {
      const result = await adminResolveRemovalRequest({
        review_id: reviewId,
        decision,
      });
      if (!result.success) {
        toast.error("Could not save the decision. Please try again.");
        return;
      }
      toast.success(
        decision === "honor" ? "Removed and request honored" : "Request denied",
      );
    });

  return (
    <div className="flex items-end gap-2">
      <PendingButton
        pending={inFlight === "honor"}
        mode="wait"
        variant="destructive"
        idleLabel="Honor (remove)"
        workingLabel="Removing..."
        slowLabel="Still removing..."
        outcome="the review was removed"
        disabled={busy}
        onClick={() => handle("honor")}
      />
      <PendingButton
        pending={inFlight === "deny"}
        mode="wait"
        variant="outline"
        idleLabel="Deny (keep)"
        workingLabel="Saving..."
        slowLabel="Still saving..."
        outcome="the decision was saved"
        disabled={busy}
        onClick={() => handle("deny")}
      />
    </div>
  );
}
