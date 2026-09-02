"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/reveals/TurnstileWidget";
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_SUBJECT_MAX,
} from "@/lib/schemas/contact";
import { submitContact } from "@/lib/contact/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { useSubmissionId } from "@/components/ui/use-submission-id";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  // This message's identity, minted here rather than by the database (#708). It
  // survives a failed attempt on purpose: a retry has to carry the SAME id, or it
  // is just a second message wearing a hat.
  const { currentSubmissionId, renewSubmissionId } = useSubmissionId();

  const clearError = (field: string) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setErrors({});

    if (!token) {
      setErrors({ turnstile_token: "Please complete the CAPTCHA" });
      return;
    }

    startTransition(async () => {
      const result = await submitContact({
        name,
        email,
        subject,
        message,
        turnstile_token: token,
        submission_id: currentSubmissionId(),
      });
      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          return;
        }
        toast.error(
          result.error === "captcha_failed"
            ? "CAPTCHA didn't verify. Please retry."
            : "Could not send your message. Please try again.",
        );
        return;
      }
      // Landed. Roll the id over so a genuine second message is not mistaken for
      // a duplicate of this one and silently dropped.
      renewSubmissionId();
      captureClientEvent(ANALYTICS_EVENTS.CONTACT_FORM_SUBMITTED, { subject });
      setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <div className="border-sage/20 bg-warm-white space-y-3 rounded-lg border p-6 text-sm">
        <h2 className="font-heading text-lg font-semibold">
          Thanks, we got your message
        </h2>
        <p className="text-soft-black-light">
          We typically reply within one business day. If you don&apos;t hear
          back, check your spam folder or email{" "}
          <a
            href="mailto:support@nursedex.com"
            className="text-teal hover:underline"
          >
            support@nursedex.com
          </a>{" "}
          directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="contact_name" className="mb-1.5 block">
          Your name
        </Label>
        <Input
          id="contact_name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          maxLength={80}
          required
          disabled={pending}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-destructive mt-1 text-xs">{errors.name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="contact_email" className="mb-1.5 block">
          Email
        </Label>
        <Input
          id="contact_email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError("email");
          }}
          required
          disabled={pending}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-destructive mt-1 text-xs">{errors.email}</p>
        )}
      </div>

      <div>
        <Label htmlFor="contact_subject" className="mb-1.5 block">
          Subject
        </Label>
        <Input
          id="contact_subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            clearError("subject");
          }}
          maxLength={CONTACT_SUBJECT_MAX}
          required
          disabled={pending}
          aria-invalid={!!errors.subject}
        />
        {errors.subject && (
          <p className="text-destructive mt-1 text-xs">{errors.subject}</p>
        )}
      </div>

      <div>
        <Label htmlFor="contact_message" className="mb-1.5 block">
          Message
        </Label>
        <Textarea
          id="contact_message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            clearError("message");
          }}
          maxLength={CONTACT_MESSAGE_MAX}
          rows={6}
          required
          disabled={pending}
          aria-invalid={!!errors.message}
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span
            className={
              errors.message ? "text-destructive" : "text-muted-foreground"
            }
          >
            {errors.message ?? "Tell us what's going on."}
          </span>
          <span className="text-muted-foreground">
            {message.length}/{CONTACT_MESSAGE_MAX}
          </span>
        </div>
      </div>

      <div>
        <TurnstileWidget onSolved={setToken} />
        {errors.turnstile_token && (
          <p className="text-destructive mt-1 text-xs">
            {errors.turnstile_token}
          </p>
        )}
      </div>

      {/* Still wait, not retry, but no longer because a second fire would send a
          second message: the submission id makes that impossible now (#708).
          Graduating this button to retry is tracked with the rest of them in
          #669, which needs the newest-attempt guard, not just an idempotent
          write. */}
      <PendingButton
        pending={pending}
        mode="wait"
        type="submit"
        idleLabel="Send message"
        workingLabel="Sending..."
        slowLabel="Still sending..."
        outcome="your message went through before sending it again"
        stalledVerb="sending"
        disabled={!name || !email || !subject || !message}
      />
    </form>
  );
}
