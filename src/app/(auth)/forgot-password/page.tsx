"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forgotPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    const result = await forgotPassword(formData);

    if (result.error) {
      setError(result.error);
      requestAnimationFrame(() => errorRef.current?.focus());
      setLoading(false);
    } else if (result.success) {
      router.push("/forgot-password/sent");
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Reset your password</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your email and we will send you a reset link.{" "}
          <Link href="/login" className="text-teal font-medium underline">
            Back to sign in
          </Link>
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error outline-none">
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
            className="h-11"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-teal text-warm-white font-semibold text-base hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
