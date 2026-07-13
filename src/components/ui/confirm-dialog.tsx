"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import type { StalledVerb } from "@/components/ui/stalled-copy";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ButtonVariantProps } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// The one confirmation primitive (#674).
//
// Eight admin components gated their destructive writes behind window.confirm
// and one behind window.prompt. That dialog cannot be styled, cannot be made
// properly accessible, and cannot lay out what the action actually does: the
// newsletter send reduced "email 412 real people, irreversibly" to a one-line
// grey prompt. Worse, some mobile browsers suppress repeated confirms outright,
// which would fire a destructive action with NO confirmation at all.
//
// Modelled on the RemoveDialog and RejectDialog that already did this by hand.
// Those two keep their own dialogs: they collect a reason that gets emailed to
// the user, so they are forms that happen to confirm, not confirmations.

/**
 * Always controlled, because half the callers cannot use a trigger.
 *
 * A dropdown menu item cannot own the dialog: the menu unmounts as it closes and
 * takes the dialog with it. Those callers render this as a sibling of the menu
 * and open it from parent state, so `open` has to come from outside. The plain
 * buttons hold the same state anyway, since closing on success is theirs to do.
 */
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional convenience trigger. Omit it when a menu item does the opening. */
  trigger?: React.ReactNode;
  triggerVariant?: ButtonVariantProps["variant"];
  triggerClassName?: string;
  /**
   * The heading. A ReactNode, not just a string, so a caller can mask personal
   * data inside it: several admin dialogs put a user's email in the title
   * ("Suspend jane@example.com"), and PostHog session replay records rendered
   * text, so that email was going into the recording (#379). Wrap it in a
   * MASK_PII span, see src/components/ui/private.tsx.
   */
  title: ReactNode;
  /** The full consequence, in plain words. This is the whole point. */
  description: React.ReactNode;
  confirmLabel: string;
  workingLabel: string;
  slowLabel?: string;
  /** What to look for after a stall, as a clause: "the post was deleted" (#673). */
  outcome?: string;
  stalledVerb?: StalledVerb;
  /** Escape hatch for copy that does not fit the shape. Prefer `outcome`. */
  stalledMessage?: string;
  /** `destructive` on a delete, the default elsewhere. */
  confirmVariant?: ButtonVariantProps["variant"];
  /** Caller's own reason to refuse, e.g. the rename field is empty. */
  confirmDisabled?: boolean;
  pending: boolean;
  onConfirm: () => void;
  /** An extra field, e.g. the rename input. */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  triggerVariant = "destructive",
  triggerClassName,
  title,
  description,
  confirmLabel,
  workingLabel,
  slowLabel,
  outcome,
  stalledVerb,
  stalledMessage,
  confirmVariant = "destructive",
  confirmDisabled = false,
  pending,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form: Enter in a field
    // still submits. The handler is the gate.
    if (pending || confirmDisabled) return;
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogTrigger
          className={
            triggerClassName ??
            buttonVariants({ variant: triggerVariant, size: "sm" })
          }
        >
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          {title}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          {description}
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {children}

          <div className="flex items-end justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {/* wait, not retry. Every caller here emails a real person or
                deletes a real row, so a stall never hands the button back. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              variant={confirmVariant}
              idleLabel={confirmLabel}
              workingLabel={workingLabel}
              slowLabel={slowLabel}
              outcome={outcome}
              stalledVerb={stalledVerb}
              stalledMessage={stalledMessage}
              disabled={confirmDisabled}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
