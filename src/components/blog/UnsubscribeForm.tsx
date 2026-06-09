"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unsubscribeByEmail } from "@/lib/newsletter/actions";

export function UnsubscribeForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await unsubscribeByEmail({ email });
      if (!res.success) {
        setError("Enter a valid email address.");
        return;
      }
      setStatus("success");
    });
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Unsubscribe
      </Button>
    </form>
  );
}
