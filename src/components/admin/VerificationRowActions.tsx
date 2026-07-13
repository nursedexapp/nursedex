"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
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
  REJECT_REASONS,
  REJECT_DETAILS_MAX,
  type RejectReason,
} from "@/lib/schemas/admin";
import {
  approveVerification,
  rejectVerification,
} from "@/lib/admin/verification-actions";

// wait, not retry (#443 phase 4). Approving or rejecting emails a real nurse, so
// a second fire is a second email to a person.
//
// It stays wait even though #652 landed a database guard against the double
// write. The guard makes a repeat apply come back as `wrong_state`, and these
// components map any failure to "Could not approve. Please try again." So a retry
// after a hung-but-successful approve would tell the admin it FAILED when it
// worked. Graduating to retry needs that "already applied" case handled first
// (#669).

interface VerificationRowActionsProps {
  userId: string;
  nurseFirstName: string;
}

export function VerificationRowActions({
  userId,
  nurseFirstName,
}: VerificationRowActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <ApproveDialog userId={userId} nurseFirstName={nurseFirstName} />
      <RejectDialog userId={userId} nurseFirstName={nurseFirstName} />
    </div>
  );
}

function ApproveDialog({
  userId,
  nurseFirstName,
}: {
  userId: string;
  nurseFirstName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await approveVerification({ user_id: userId });
      if (!result.success) {
        toast.error("Could not approve. Please try again.");
        return;
      }
      toast.success(`Approved ${nurseFirstName}`);
      setOpen(false);
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <Check className="mr-1 size-3.5" />
          Approve
        </>
      }
      triggerVariant="default"
      title={`Approve ${nurseFirstName}'s verification`}
      description={`${nurseFirstName} gets a verified badge on her profile, becomes visible in family search, and is emailed to say she was approved. The email goes out immediately and cannot be recalled.`}
      confirmLabel="Approve verification"
      workingLabel="Approving..."
      slowLabel="Still approving..."
      outcome="the nurse was approved"
      confirmVariant="default"
      pending={pending}
      onConfirm={handleConfirm}
    />
  );
}

function RejectDialog({
  userId,
  nurseFirstName,
}: {
  userId: string;
  nurseFirstName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RejectReason | "">("");
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setErrors({});
    if (!reason) {
      setErrors({ reason: "Pick a reason" });
      return;
    }
    startTransition(async () => {
      const result = await rejectVerification({
        user_id: userId,
        reason,
        details,
      });
      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          return;
        }
        toast.error("Could not reject. Please try again.");
        return;
      }
      toast.success(`Rejected ${nurseFirstName}`);
      setOpen(false);
      setReason("");
      setDetails("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <X className="mr-1 size-3.5" />
        Reject
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          Reject {nurseFirstName}&apos;s verification
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          They&apos;ll get an email with this reason and can resubmit after
          fixing the issue.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="reject_reason" className="mb-1.5 block">
              Reason
            </Label>
            <select
              id="reject_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as RejectReason)}
              disabled={pending}
              required
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-lg border px-3 text-sm transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a reason...</option>
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="text-destructive mt-1 text-xs">{errors.reason}</p>
            )}
          </div>

          <div>
            <Label htmlFor="reject_details" className="mb-1.5 block">
              Details
              {reason !== "Other" && (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id="reject_details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={REJECT_DETAILS_MAX}
              rows={4}
              disabled={pending}
              required={reason === "Other"}
              placeholder="Anything that would help the nurse fix the issue."
            />
            <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
              <span>{errors.details ?? "Sent verbatim in the email."}</span>
              <span>
                {details.length}/{REJECT_DETAILS_MAX}
              </span>
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
              idleLabel="Send rejection"
              workingLabel="Sending..."
              slowLabel="Still sending..."
              outcome="the rejection was sent"
              stalledVerb="sending"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
