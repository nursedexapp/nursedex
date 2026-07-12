"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";
import { PendingButton } from "@/components/ui/pending-button";
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
    if (pending) return;
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

  // wait, not retry (#443 phase 4). Restoring writes the current content to
  // history and replaces it, so a second fire adds another history entry.
  return (
    <PendingButton
      pending={pending}
      mode="wait"
      variant="outline"
      idleLabel="Restore"
      workingLabel="Restoring..."
      slowLabel="Still restoring..."
      stalledMessage="This is still processing. Please do not close this page. Refresh to check whether the version was restored."
      icon={<History className="size-4" />}
      onClick={onRestore}
    />
  );
}
