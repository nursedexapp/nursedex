"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePendingPhase } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
import {
  approveComment,
  rejectComment,
  deleteComment,
  type CommentResult,
} from "@/lib/comments/actions";
import { BlogCommentStatus } from "@/types/enums";

interface Props {
  id: string;
  status: BlogCommentStatus;
}

type Action = "approve" | "reject" | "delete";

const WORKING: Record<Action, string> = {
  approve: "Approving",
  reject: "Rejecting",
  delete: "Deleting",
};

// wait, not retry (#443 phase 4). These are moderation writes on a live comment.
// The row is three icon buttons, too small to carry PendingButton's stall panel,
// so it borrows the same clock and renders one alert for the row.
export function CommentModerationActions({ id, status }: Props) {
  const router = useRouter();
  const { inFlight, busy, run } = useInFlight<Action>();
  const { phase } = usePendingPhase({ pending: busy });
  const stalled = phase === "stalled";
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the alert, as PendingButton does: a keyboard admin lost focus to
    // <body> the moment the row went disabled.
    if (stalled) requestAnimationFrame(() => alertRef.current?.focus());
  }, [stalled]);

  function act(
    key: Action,
    fn: (id: string) => Promise<CommentResult>,
    successMsg: string,
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    run(key, async () => {
      const res = await fn(id);
      if (!res.success) {
        toast.error("Something went wrong. Please try again.");
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  const iconBtn =
    "hover:bg-muted inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      {stalled && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="bg-error/10 text-error rounded-lg px-3 py-2 text-xs outline-none"
        >
          Still processing. Refresh to check whether it went through.
        </div>
      )}

      <div className="flex items-center gap-1">
        {/* Names the action that is running. The old spinner sat on its own and
            could have belonged to any of the three buttons. */}
        {inFlight && (
          <span
            role="status"
            aria-live="polite"
            className="text-soft-black-light flex items-center gap-1 text-xs"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {WORKING[inFlight]}...
          </span>
        )}
        {status !== BlogCommentStatus.APPROVED && (
          <button
            type="button"
            onClick={() => act("approve", approveComment, "Comment approved.")}
            disabled={busy}
            aria-label="Approve comment"
            className={`${iconBtn} text-success`}
          >
            <Check className="size-4" />
          </button>
        )}
        {status !== BlogCommentStatus.REJECTED && (
          <button
            type="button"
            onClick={() => act("reject", rejectComment, "Comment rejected.")}
            disabled={busy}
            aria-label="Reject comment"
            className={`${iconBtn} text-soft-black-light`}
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            act(
              "delete",
              deleteComment,
              "Comment deleted.",
              "Delete this comment permanently?",
            )
          }
          disabled={busy}
          aria-label="Delete comment"
          className={`${iconBtn} text-error`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
