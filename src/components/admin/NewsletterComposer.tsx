"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendNewsletterIssue } from "@/lib/newsletter/actions";

/** "1 subscriber" against "2 subscribers", in one place rather than four. */
function people(n: number | undefined): string {
  return n === 1 ? "subscriber" : "subscribers";
}

export function NewsletterComposer({
  subscriberCount,
}: {
  subscriberCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const noun = subscriberCount === 1 ? "subscriber" : "subscribers";

  function openConfirm() {
    setErrors({});
    if (subscriberCount === 0) {
      toast.error("No confirmed subscribers yet.");
      return;
    }
    setOpen(true);
  }

  function onSend() {
    // The most expensive button in the app to fire twice: it emails every
    // confirmed subscriber. The handler is the gate, not the disabled attribute.
    if (pending) return;
    startTransition(async () => {
      const res = await sendNewsletterIssue({ subject, body });
      if (!res.success) {
        // A send that reached nobody is not a validation problem, and the
        // fields are fine: saying "fix the highlighted fields" would send the
        // admin to look for an error that is not there (#422).
        if (res.error === "send_failed") {
          setOpen(false);
          toast.error(
            `Nothing was sent. All ${res.failed} ${people(res.failed)} failed. Nobody has received this, so it is safe to try again.`,
          );
          return;
        }
        if (res.fieldErrors) setErrors(res.fieldErrors);
        // Close on a validation failure: the fields it is complaining about sit
        // behind the dialog, so leaving it up points the admin at errors they
        // cannot see.
        setOpen(false);
        toast.error("Please fix the highlighted fields.");
        return;
      }
      if (res.failed && res.failed > 0) {
        // Partly sent. Not a success toast: some real people did not get this,
        // and the admin is the only one who can notice (L10). Deliberately
        // does not offer a retry, because sending again would deliver a second
        // copy to everybody who already got it, and the fix for that needs a
        // per issue send record (#422 is still open for it).
        toast.warning(
          `Sent to ${res.sent} ${people(res.sent)}, but ${res.failed} ${people(res.failed)} could not be reached. Sending again would send a second copy to everyone who did get it.`,
        );
      } else {
        toast.success(`Sent to ${res.sent} ${people(res.sent)}.`);
      }
      setSubject("");
      setBody("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="nl-subject">Subject</Label>
        <Input
          id="nl-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1"
        />
        {errors.subject && (
          <p className="text-error mt-1 text-xs">{errors.subject}</p>
        )}
      </div>
      <div>
        <Label htmlFor="nl-body">Body</Label>
        <Textarea
          id="nl-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder="Plain text. Leave a blank line between paragraphs."
          className="mt-1"
        />
        {errors.body && (
          <p className="text-error mt-1 text-xs">{errors.body}</p>
        )}
      </div>
      <Button onClick={openConfirm}>
        <Send className="mr-2 size-4" />
        Send to {subscriberCount} {noun}
      </Button>

      {/* wait, not retry (#443 phase 4). A second send is a second newsletter to
          every subscriber. There is nothing safe to hand back on a stall. */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Send this issue now?"
        description={`This emails "${subject || "(no subject)"}" to all ${subscriberCount} confirmed ${noun} immediately. It cannot be recalled, edited or unsent.`}
        confirmLabel="Send now"
        workingLabel="Sending..."
        slowLabel="Still sending..."
        outcome="the issue went out before sending it again"
        stalledVerb="sending"
        pending={pending}
        onConfirm={onSend}
      />
    </div>
  );
}
