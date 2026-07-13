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
        if (res.fieldErrors) setErrors(res.fieldErrors);
        // Close on a validation failure: the fields it is complaining about sit
        // behind the dialog, so leaving it up points the admin at errors they
        // cannot see.
        setOpen(false);
        toast.error("Please fix the highlighted fields.");
        return;
      }
      toast.success(
        `Sent to ${res.sent} ${res.sent === 1 ? "subscriber" : "subscribers"}.`,
      );
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
        stalledMessage="This is still sending. Please do not close this page. Refresh to check whether the issue went out before sending it again."
        pending={pending}
        onConfirm={onSend}
      />
    </div>
  );
}
