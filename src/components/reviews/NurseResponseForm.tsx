"use client";

import { useState } from "react";
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
import { NURSE_RESPONSE_MAX } from "@/lib/schemas/review";
import {
  saveNurseResponse,
  deleteNurseResponse,
} from "@/lib/reviews/nurse-actions";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";

interface NurseResponseFormProps {
  reviewId: string;
  existingResponse: string | null;
}

export function NurseResponseForm({
  reviewId,
  existingResponse,
}: NurseResponseFormProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(existingResponse ?? "");
  const [error, setError] = useState<string | null>(null);
  // Keyed: a single flag would put "Saving..." on the Delete button too.
  //
  // retry, not wait (#669 phase 5). Both actions are plain UPDATEs on the review
  // row (write the response text, or clear it), so repeating one lands on exactly
  // the same result. The only thing that stopped them offering a retry was that a
  // retry does not cancel the first request, and the hung one could land
  // afterwards and contradict it. `useInFlight` carries that guard now.
  const { inFlight, busy, run, retry } = useInFlight<"save" | "delete">();
  const pending = busy;

  const isEdit = Boolean(existingResponse);
  const triggerLabel = isEdit ? "Edit response" : "Respond";

  const save = (viaRetry = false) => {
    // `run` refuses re-entry, which is what keeps Delete dead while a save is in
    // flight. A retry needs the other door (#669).
    const start = viaRetry ? retry : run;

    start("save", async (isLatest) => {
      const result = await saveNurseResponse({
        review_id: reviewId,
        text,
      });

      // Superseded by a retry: this attempt no longer owns the dialog.
      if (!isLatest()) return;

      if (!result.success) {
        if (result.fieldErrors?.text) {
          setError(result.fieldErrors.text);
          return;
        }
        toast.error("Could not save your response. Please try again.");
        return;
      }
      toast.success(isEdit ? "Response updated" : "Response posted");
      setOpen(false);
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (busy) return;
    setError(null);
    save();
  };

  const remove = (viaRetry = false) => {
    const start = viaRetry ? retry : run;

    start("delete", async (isLatest) => {
      const result = await deleteNurseResponse(reviewId);

      if (!isLatest()) return;

      if (!result.success) {
        toast.error("Could not delete your response. Please try again.");
        return;
      }
      toast.success("Response deleted");
      setOpen(false);
      setText("");
    });
  };

  const handleDelete = () => remove();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          {isEdit ? "Edit your response" : "Respond to this review"}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Your response is auto checked for profanity and posted right away.
          Keep it under {NURSE_RESPONSE_MAX} characters.
        </DialogDescription>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="nurse_response" className="mb-1.5 block">
              Your response
            </Label>
            <Textarea
              id="nurse_response"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={NURSE_RESPONSE_MAX}
              rows={5}
              disabled={pending}
              required
            />
            <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
              <span>{error ?? "Visible publicly under the review."}</span>
              <span>
                {text.length}/{NURSE_RESPONSE_MAX}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              {isEdit && (
                <PendingButton
                  pending={inFlight === "delete"}
                  mode="retry"
                  variant="ghost"
                  idleLabel="Delete"
                  workingLabel="Deleting..."
                  slowLabel="Still deleting..."
                  disabled={busy && inFlight !== "delete"}
                  onClick={handleDelete}
                  onRetry={() => remove(true)}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <PendingButton
                pending={inFlight === "save"}
                mode="retry"
                type="submit"
                idleLabel={isEdit ? "Save changes" : "Post response"}
                workingLabel="Saving..."
                slowLabel="Still saving..."
                disabled={busy && inFlight !== "save"}
                onRetry={() => save(true)}
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
