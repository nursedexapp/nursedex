"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/reveals/TurnstileWidget";
import { CONTACT_MESSAGE_MAX } from "@/lib/schemas/contact";
import { submitContact } from "@/lib/contact/actions";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!token) {
      setErrors({ turnstile_token: "Please complete the CAPTCHA" });
      return;
    }

    startTransition(async () => {
      const result = await submitContact({
        name,
        email,
        message,
        turnstile_token: token,
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
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          disabled={pending}
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
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
        />
        {errors.email && (
          <p className="text-destructive mt-1 text-xs">{errors.email}</p>
        )}
      </div>

      <div>
        <Label htmlFor="contact_message" className="mb-1.5 block">
          Message
        </Label>
        <Textarea
          id="contact_message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={CONTACT_MESSAGE_MAX}
          rows={6}
          required
          disabled={pending}
        />
        <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
          <span>{errors.message ?? "Tell us what's going on."}</span>
          <span>
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

      <Button type="submit" disabled={pending || !name || !email || !message}>
        {pending ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
