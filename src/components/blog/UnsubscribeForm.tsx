"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
import { Input } from "@/components/ui/input";
import { unsubscribeByEmail } from "@/lib/newsletter/actions";

export function UnsubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  // Through the shared primitive rather than a hand-rolled flag and a bare
  // `void (async () => ...)` (#987). The hand-rolled version had no catch, so a
  // rejection left the button back at its label with nothing said. The message
  // is set here rather than toasted because this form reports inline.
  const { inFlight, run, retry } = useInFlight<"unsubscribe">({
    onError: () => setError("Something went wrong. Please try again."),
  });

  const unsubscribe = async (isLatest: () => boolean) => {
    const res = await unsubscribeByEmail({ email });

    // Superseded by a retry. The first request is still in flight and may yet
    // land; if it failed, saying so now would drag the form back out of the
    // success the retry already reached.
    if (!isLatest()) return;

    if (!res.success) {
      setError("Enter a valid email address.");
      return;
    }
    setStatus("success");
  };

  // `run` is the gate, so it refuses while something is in flight. `retry` is
  // the one door past it (#669), which is what a stalled retry-mode button
  // needs: pressed through `run` it would do nothing at all.
  const submit = () => {
    setError(null);
    run("unsubscribe", unsubscribe);
  };

  const submitAgain = () => {
    setError(null);
    retry("unsubscribe", unsubscribe);
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A disabled submit button stops the button, not the form. `run` is itself
    // the gate too, so this is belt and braces rather than the only guard.
    if (inFlight) return;
    submit();
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
        pending={inFlight === "unsubscribe"}
        mode="retry"
        type="submit"
        idleLabel="Unsubscribe"
        workingLabel="Unsubscribing..."
        slowLabel="Still unsubscribing..."
        onRetry={submitAgain}
        className="w-full"
      />
    </form>
  );
}
