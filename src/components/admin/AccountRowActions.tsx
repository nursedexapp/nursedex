"use client";

import { MASK_PII } from "@/components/ui/private";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  type AccountActionError,
} from "@/lib/admin/account-actions";

// wait, not retry (#443 phase 4). Suspending locks a real person out and emails
// them; removing soft-deletes them, cancels their Stripe subscriptions and blocks
// their email from signing up again. Nothing here is safe to fire twice. See
// VerificationRowActions for why the #652 guard does not yet make these safe to
// retry (#669).

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

  const handleUnsuspend = () => {
    if (pending) return;
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
        <PendingButton
          pending={pending}
          mode="wait"
          idleLabel="Unsuspend"
          workingLabel="Unsuspending..."
          slowLabel="Still unsuspending..."
          outcome="the account was unsuspended"
          onClick={handleUnsuspend}
        />
      ) : (
        <SuspendDialog userId={userId} email={email} />
      )}
      <RemoveDialog userId={userId} email={email} />
    </div>
  );
}

function SuspendDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
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
      setOpen(false);
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger="Suspend"
      triggerVariant="outline"
      title={
        <>
          Suspend <span className={MASK_PII}>{email}</span>
        </>
      }
      description="They are locked out of their account immediately and emailed to say it was suspended. Their profile stops appearing in search. You can unsuspend them at any time."
      confirmLabel="Suspend account"
      workingLabel="Suspending..."
      slowLabel="Still suspending..."
      outcome="the account was suspended"
      pending={pending}
      onConfirm={handleConfirm}
    />
  );
}

/**
 * What each refusal actually means for the account, and what the admin can do
 * about it. Keyed by every member of AccountActionError so a new one cannot be
 * added without deciding what it says here (#982, L113).
 */
const REMOVE_FAILURE_MESSAGES: Record<AccountActionError, string> = {
  self_action: "You can't remove your own admin account.",
  invalid: "That removal request was not valid. Please try again.",
  not_found: "That account no longer exists.",
  wrong_state: "That account has already been removed.",
  lookup_failed:
    "We couldn't read that account, so nothing was changed. Please try again.",
  ban_unwritten:
    "The block list could not be updated, so nothing was changed and this person could still sign up again. Please try again.",
  audit_unwritten:
    "The account was removed, but the removal was not recorded in the admin log. There is nothing to retry; the failure has been reported.",
  unknown: "Could not remove. Please try again.",
};

function RemoveDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    if (!reason.trim()) return;

    startTransition(async () => {
      const result = await removeAccount({ user_id: userId, reason });
      if (!result.success) {
        // Each of these leaves the account in a different state, and one of
        // them is not a failure to remove at all (#982). "Please try again" is
        // actively wrong on audit_unwritten: the removal already happened, so
        // a retry comes back wrong_state and the admin is sent round a loop
        // that cannot end.
        toast.error(REMOVE_FAILURE_MESSAGES[result.error ?? "unknown"]);
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
          Remove <span className={MASK_PII}>{email}</span>
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

          <div className="flex items-end justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              variant="destructive"
              idleLabel="Remove account"
              workingLabel="Removing..."
              slowLabel="Still removing..."
              outcome="the account was removed"
              disabled={!reason.trim()}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
