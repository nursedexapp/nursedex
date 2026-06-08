"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  suspendAccount,
  unsuspendAccount,
  removeAccount,
} from "@/lib/admin/account-actions";

interface AccountRowActionsProps {
  userId: string;
  email: string;
  isSuspended: boolean;
  isDeleted: boolean;
}

export function AccountRowActions({
  userId,
  email,
  isSuspended,
  isDeleted,
}: AccountRowActionsProps) {
  const [pending, startTransition] = useTransition();

  if (isDeleted) {
    return <span className="text-muted-foreground text-xs">Removed</span>;
  }

  const handleSuspend = () => {
    if (!confirm(`Suspend ${email}? They'll be locked out and emailed.`)) {
      return;
    }
    startTransition(async () => {
      const result = await suspendAccount({ user_id: userId });
      if (!result.success) {
        toast.error(
          result.error === "self_action"
            ? "You can't suspend your own admin account."
            : "Could not suspend. Please try again.",
        );
        return;
      }
      toast.success("Suspended");
    });
  };

  const handleUnsuspend = () => {
    startTransition(async () => {
      const result = await unsuspendAccount({ user_id: userId });
      if (!result.success) {
        toast.error("Could not unsuspend. Please try again.");
        return;
      }
      toast.success("Unsuspended");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isSuspended ? (
        <Button size="sm" onClick={handleUnsuspend} disabled={pending}>
          Unsuspend
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleSuspend}
          disabled={pending}
        >
          Suspend
        </Button>
      )}
      <RemoveDialog userId={userId} email={email} />
    </div>
  );
}

function RemoveDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    startTransition(async () => {
      const result = await removeAccount({ user_id: userId, reason });
      if (!result.success) {
        toast.error(
          result.error === "self_action"
            ? "You can't remove your own admin account."
            : "Could not remove. Please try again.",
        );
        return;
      }
      toast.success("Account removed");
      setOpen(false);
      setReason("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: "destructive", size: "sm" })}
      >
        Remove
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          Remove {email}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          This soft-deletes the user, cancels any active Stripe subscriptions,
          and adds the email to the blocked list so they can&apos;t sign up
          again. The user gets an email with the reason. This is reversible only
          by manual DB intervention.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="remove_reason" className="mb-1.5 block">
              Reason (sent to user)
            </Label>
            <Textarea
              id="remove_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              required
              disabled={pending}
              placeholder="Why is this account being removed?"
            />
            <div className="text-muted-foreground mt-1 text-right text-xs">
              {reason.length}/500
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !reason.trim()}
            >
              {pending ? "Removing..." : "Remove account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
