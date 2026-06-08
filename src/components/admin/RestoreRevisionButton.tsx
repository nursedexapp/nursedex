"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreRevision } from "@/lib/blog/actions";

export function RestoreRevisionButton({
  revisionId,
  postId,
}: {
  revisionId: string;
  postId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRestore() {
    if (
      !window.confirm(
        "Restore this version? The current content is saved to history first.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await restoreRevision(revisionId);
      if (!res.success) {
        toast.error("Could not restore this version.");
        return;
      }
      toast.success("Version restored.");
      router.push(`/admin/blog/${postId}/edit`);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onRestore} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <History className="size-4" />
      )}
      Restore
    </Button>
  );
}
