"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { restoreRevision } from "@/lib/blog/actions";

export function RestoreRevisionButton({
  revisionId,
  postId,
}: {
  revisionId: string;
  postId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onRestore() {
    startTransition(async () => {
      const res = await restoreRevision(revisionId);
      if (!res.success) {
        toast.error("Could not restore this version.");
        return;
      }
      toast.success("Version restored.");
      setOpen(false);
      router.push(`/admin/blog/${postId}/edit`);
      router.refresh();
    });
  }

  // wait, not retry (#443 phase 4). Restoring writes the current content to
  // history and replaces it, so a second fire adds another history entry.
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <History className="mr-2 size-4" />
          Restore
        </>
      }
      triggerVariant="outline"
      title="Restore this version?"
      description="This replaces the post's current content with this version. The content you have now is saved to history first, so nothing is lost and you can restore back."
      confirmLabel="Restore this version"
      workingLabel="Restoring..."
      slowLabel="Still restoring..."
      outcome="the version was restored"
      confirmVariant="default"
      pending={pending}
      onConfirm={onRestore}
    />
  );
}
