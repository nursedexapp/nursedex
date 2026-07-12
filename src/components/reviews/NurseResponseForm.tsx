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
  // wait, not retry (#443 phase 5). Retry would be the nicer answer here (these
  // actions are safe to repeat), but a retry does NOT cancel the first request: it
  // leaves a hung one in flight that can still land and contradict the retry, the
  // hole PhotoUpload had to close with a newest-attempt guard (#667). Graduating
  // these to retry means carrying that guard, which is tracked in #669.
  const { inFlight, busy, run } = useInFlight<"save" | "delete">();
  const pending = busy;

  const isEdit = Boolean(existingResponse);
  const triggerLabel = isEdit ? "Edit response" : "Respond";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    run("save", async () => {
      const result = await saveNurseResponse({
        review_id: reviewId,
        text,
      });
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

  const handleDelete = () => {
    run("delete", async () => {
      const result = await deleteNurseResponse(reviewId);
      if (!result.success) {
        toast.error("Could not delete your response. Please try again.");
        return;
      }
      toast.success("Response deleted");
      setOpen(false);
      setText("");
    });
  };

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
                  mode="wait"
                  variant="ghost"
                  idleLabel="Delete"
                  workingLabel="Deleting..."
                  slowLabel="Still deleting..."
                  disabled={busy}
                  onClick={handleDelete}
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
                mode="wait"
                type="submit"
                idleLabel={isEdit ? "Save changes" : "Post response"}
                workingLabel="Saving..."
                slowLabel="Still saving..."
                disabled={busy}
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
