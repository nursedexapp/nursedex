"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletter } from "@/lib/newsletter/actions";

export function NewsletterCta({ source }: { source: string }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await subscribeNewsletter({ email, source, website });
      if (!res.success) {
        setError(
          res.fieldErrors?.email ??
            (res.error === "rate_limited"
              ? "Too many attempts from your network. Please try again later."
              : res.error === "email_unsent"
                ? "We could not send the confirmation email. Please try again."
                : "Something went wrong. Please try again."),
        );
        return;
      }
      setStatus("success");
    });
  }

  return (
    <section className="border-sage-light/40 bg-sage/5 rounded-lg border p-6">
      {status === "success" ? (
        <div className="text-soft-black flex items-center gap-2">
          <CheckCircle2 className="text-teal size-5" />
          <p className="text-sm font-medium">
            Almost there! Check your email to confirm.
          </p>
        </div>
      ) : (
        <>
          <h2 className="font-heading text-soft-black text-lg font-semibold">
            Get new posts in your inbox
          </h2>
          <p className="text-soft-black-light mt-1 text-sm">
            Occasional guides on home care and finding trusted nurses. No spam.
          </p>
          <form
            onSubmit={onSubmit}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="sm:flex-1"
            />
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
            />
            {/* wait, not retry (#443 phase 5): subscribing sends a
                confirmation email, so a second fire is a second email. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              idleLabel="Subscribe"
              workingLabel="Subscribing..."
              slowLabel="Still subscribing..."
              outcome="the confirmation email is on its way"
            />
          </form>
          {error && <p className="text-error mt-2 text-sm">{error}</p>}
        </>
      )}
    </section>
  );
}
