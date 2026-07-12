"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forgotPassword } from "@/lib/auth/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPending(true);
    try {
      await handleSubmit(formData);
    } finally {
      setPending(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    const result = await forgotPassword(formData);

    if (result.error) {
      setError(result.error);
      requestAnimationFrame(() => errorRef.current?.focus());
    } else if (result.success) {
      router.push("/forgot-password/sent");
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Reset your password</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter your email and we will send you a reset link.{" "}
          <Link href="/login" className="text-teal-dark font-medium underline">
            Back to sign in
          </Link>
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="bg-error/10 text-error rounded-lg px-4 py-3 text-sm outline-none"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="your@email.com"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <PendingButton
          pending={pending}
          // Sends an email, and Supabase rate-limits those, so a retry can both
          // send a second one and get itself throttled. The user waits.
          mode="wait"
          type="submit"
          idleLabel="Send reset link"
          workingLabel="Sending..."
          className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
        />
      </form>
    </div>
  );
}
