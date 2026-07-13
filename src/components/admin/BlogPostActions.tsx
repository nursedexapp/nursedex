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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // wait, not retry (#443 phase 4). Publishing puts a post live and deleting
  // takes it away. The control is an icon menu trigger, too small for the stall
  // panel, so it borrows the shared clock and renders its own alert.
  const { phase } = usePendingPhase({ pending });
  // While the delete dialog is up, the PendingButton inside it owns the stall
  // alert. Rendering this one too would put two on screen for one action.
  const stalled = phase === "stalled" && !confirmingDelete;
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stalled) requestAnimationFrame(() => alertRef.current?.focus());
  }, [stalled]);

  function run(
    fn: (id: string) => Promise<BlogActionResult>,
    successMsg: string,
  ) {
    if (pending) return;
    setOpen(false);
    startTransition(async () => {
      const res = await fn(id);
      if (!res.success) {
        toast.error("Something went wrong. Please try again.");
        return;
      }
      toast.success(successMsg);
      setConfirmingDelete(false);
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
            onClick={() => {
              setOpen(false);
              setConfirmingDelete(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sibling of the menu, never a child of it. A dialog rendered inside the
          menu is unmounted the moment the menu closes, so the confirmation would
          flash and vanish and Delete would look like it did nothing. */}
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this post permanently?"
        description="The post and its revision history are removed for good. Any link to it starts returning a 404. This cannot be undone."
        confirmLabel="Delete post"
        workingLabel="Deleting..."
        slowLabel="Still deleting..."
        stalledMessage="This is still processing. Please do not close this page. Refresh to check whether the post was deleted."
        pending={pending}
        onConfirm={() => run(deletePost, "Post deleted.")}
      />
    </div>
  );
}
