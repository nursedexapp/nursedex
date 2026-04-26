"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, resendConfirmation } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-4">
          <div className="bg-sage/20 h-6 w-40 rounded" />
          <div className="bg-sage/20 h-4 w-56 rounded" />
          <div className="bg-sage/20 mt-8 h-11 w-full rounded-lg" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    searchParams.get("message") === "password_reset"
      ? "Password reset successfully. Sign in with your new password."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState("");

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setShowResend(false);
    setLoading(true);

    const email = formData.get("email") as string;
    setResendEmail(email);

    const result = await signIn(formData);

    if (result?.error) {
      setError(result.error);
      if (result.error.includes("confirm your email")) {
        setShowResend(true);
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    }
    setLoading(false);
  }

  async function handleResend() {
    setError(null);
    setResendLoading(true);
    const formData = new FormData();
    formData.set("email", resendEmail);
    const result = await resendConfirmation(formData);
    setResendLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(result.success);
      setShowResend(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Welcome back</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Your Long Island care community is waiting.{" "}
          <Link href="/signup" className="text-teal font-medium underline">
            New here? Create an account
          </Link>
        </p>
      </div>

      <GoogleSignInButton />

      <div className="relative my-6">
        <Separator className="bg-sage/20" />
        <span className="bg-background text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-xs">
          or continue with email
        </span>
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
            {showResend && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={handleResend}
                disabled={resendLoading}
                className="text-teal mt-1 h-auto px-0"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Resend confirmation email"
                )}
              </Button>
            )}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="bg-success/10 text-success rounded-lg px-4 py-3 text-sm"
          >
            {success}
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-teal hover:text-teal-dark text-sm font-medium underline underline-offset-2 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </div>
  );
}
