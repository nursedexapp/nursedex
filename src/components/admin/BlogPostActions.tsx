"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  archivePost,
  unpublishPost,
  publishNow,
  deletePost,
  togglePinned,
  type BlogActionResult,
} from "@/lib/blog/actions";
import { usePendingPhase } from "@/components/ui/pending-button";
import { BlogPostStatus } from "@/types/enums";

interface BlogPostActionsProps {
  id: string;
  slug: string;
  status: BlogPostStatus;
  pinned: boolean;
}

export function BlogPostActions({
  id,
  slug,
  status,
  pinned,
}: BlogPostActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // wait, not retry (#443 phase 4). Publishing puts a post live and deleting
  // takes it away. The control is an icon menu trigger, too small for the stall
  // panel, so it borrows the shared clock and renders its own alert.
  const { phase } = usePendingPhase({ pending });
  const stalled = phase === "stalled";
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stalled) requestAnimationFrame(() => alertRef.current?.focus());
  }, [stalled]);

  function run(
    fn: (id: string) => Promise<BlogActionResult>,
    successMsg: string,
    confirmMsg?: string,
  ) {
    if (pending) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setOpen(false);
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
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label="Post actions"
          disabled={pending}
          className="hover:bg-muted text-soft-black-light inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === BlogPostStatus.PUBLISHED && (
            <DropdownMenuItem
              onClick={() => {
                setOpen(false);
                window.open(`/blog/${slug}`, "_blank", "noopener");
              }}
            >
              View post
            </DropdownMenuItem>
          )}
          {(status === BlogPostStatus.SCHEDULED ||
            status === BlogPostStatus.DRAFT) && (
            <DropdownMenuItem
              onClick={() => run(publishNow, "Post published.")}
            >
              Publish now
            </DropdownMenuItem>
          )}
          {status === BlogPostStatus.PUBLISHED && (
            <DropdownMenuItem
              onClick={() =>
                run(
                  togglePinned,
                  pinned ? "Unpinned." : "Pinned to the top of the blog.",
                )
              }
            >
              {pinned ? "Unpin from top" : "Pin to top"}
            </DropdownMenuItem>
          )}
          {status === BlogPostStatus.PUBLISHED && (
            <DropdownMenuItem
              onClick={() => run(unpublishPost, "Moved back to draft.")}
            >
              Unpublish
            </DropdownMenuItem>
          )}
          {status !== BlogPostStatus.ARCHIVED && (
            <DropdownMenuItem
              onClick={() => run(archivePost, "Post archived.")}
            >
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              run(
                deletePost,
                "Post deleted.",
                "Delete this post permanently? This cannot be undone.",
              )
            }
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
