"use client";

import { useState, useTransition } from "react";
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
  deletePost,
  type BlogActionResult,
} from "@/lib/blog/actions";
import { BlogPostStatus } from "@/types/enums";

interface BlogPostActionsProps {
  id: string;
  status: BlogPostStatus;
}

export function BlogPostActions({ id, status }: BlogPostActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run(
    fn: (id: string) => Promise<BlogActionResult>,
    successMsg: string,
    confirmMsg?: string,
  ) {
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
            onClick={() => run(unpublishPost, "Moved back to draft.")}
          >
            Unpublish (back to draft)
          </DropdownMenuItem>
        )}
        {status !== BlogPostStatus.ARCHIVED && (
          <DropdownMenuItem onSelect={() => run(archivePost, "Post archived.")}>
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
  );
}
