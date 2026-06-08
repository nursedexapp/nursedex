"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

export function CommentModerationActions({ id, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    fn: (id: string) => Promise<CommentResult>,
    successMsg: string,
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
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
    <div className="flex items-center gap-1">
      {pending && <Loader2 className="text-soft-black-light size-4 animate-spin" />}
      {status !== BlogCommentStatus.APPROVED && (
        <button
          type="button"
          onClick={() => run(approveComment, "Comment approved.")}
          disabled={pending}
          aria-label="Approve comment"
          className={`${iconBtn} text-success`}
        >
          <Check className="size-4" />
        </button>
      )}
      {status !== BlogCommentStatus.REJECTED && (
        <button
          type="button"
          onClick={() => run(rejectComment, "Comment rejected.")}
          disabled={pending}
          aria-label="Reject comment"
          className={`${iconBtn} text-soft-black-light`}
        >
          <X className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          run(deleteComment, "Comment deleted.", "Delete this comment permanently?")
        }
        disabled={pending}
        aria-label="Delete comment"
        className={`${iconBtn} text-error`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
