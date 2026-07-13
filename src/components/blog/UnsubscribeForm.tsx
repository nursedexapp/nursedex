"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { useLatestAttempt } from "@/components/ui/use-latest-attempt";
import { Input } from "@/components/ui/input";
import { unsubscribeByEmail } from "@/lib/newsletter/actions";

export function UnsubscribeForm() {
  // A local flag, not useTransition (#669). useTransition stays pending until
  // EVERY transition it started settles, so the hung request would pin the button
  // and the retry's success could never clear it.
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const { begin, isLatest } = useLatestAttempt();

  const run = () => {
    const attempt = begin();
    setPending(true);
    setError(null);

    void (async () => {
      const res = await unsubscribeByEmail({ email });

      // Superseded by a retry. The first request is still in flight and may yet
      // land; if it failed, saying so now would drag the form back out of the
      // success the retry already reached.
      if (!isLatest(attempt)) return;
      setPending(false);

      if (!res.success) {
        setError("Enter a valid email address.");
        return;
      }
      setStatus("success");
    })();
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    run();
  }

  if (status === "success") {
    return (
      <div className="border-sage-light/40 bg-sage/5 text-soft-black flex items-start gap-2 rounded-lg border p-4">
        <CheckCircle2 className="text-teal mt-0.5 size-5 shrink-0" />
        <p className="text-sm">
          If <span className="font-medium">{email}</span> was subscribed, it has
          been unsubscribed from the NurseDex newsletter.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        required
      />
      {error && <p className="text-error text-sm">{error}</p>}
      {/* retry, not wait (#669 phase 5). Unsubscribing is idempotent: the action
          stamps unsubscribed_at on the row matched by this email, and doing that
          twice leaves them exactly as unsubscribed as doing it once. Telling
          someone to refresh a page they are trying to leave was the whole cost of
          being cautious here. */}
      <PendingButton
        pending={pending}
        mode="retry"
        type="submit"
        idleLabel="Unsubscribe"
        workingLabel="Unsubscribing..."
        slowLabel="Still unsubscribing..."
        onRetry={run}
        className="w-full"
      />
    </form>
  );
}
