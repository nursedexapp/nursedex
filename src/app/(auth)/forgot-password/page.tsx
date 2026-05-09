"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forgotPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Sending...
        </>
      ) : (
        "Send reset link"
      )}
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

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
          <Link
            href="/login"
            className="text-teal-dark font-medium underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
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

        <SubmitButton />
      </form>
    </div>
  );
}
