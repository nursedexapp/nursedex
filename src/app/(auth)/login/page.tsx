"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, signInWithGoogle, resendConfirmation } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    searchParams.get("message") === "password_reset"
      ? "Password reset successfully. Sign in with your new password."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
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
    }
    setLoading(false);
  }

  async function handleResend() {
    setError(null);
    const formData = new FormData();
    formData.set("email", resendEmail);
    const result = await resendConfirmation(formData);
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(result.success);
      setShowResend(false);
    }
  }

  return (
    <Card className="border-sage/20">
      <CardHeader className="text-center">
        <Link href="/" className="font-heading text-2xl font-semibold text-teal mb-2 block">
          NurseDex
        </Link>
        <CardTitle className="text-xl">Welcome back</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
            {error}
            {showResend && (
              <button
                onClick={handleResend}
                className="mt-2 block text-teal underline"
              >
                Resend confirmation email
              </button>
            )}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
            {success}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-teal underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-sage/20" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <form action={signInWithGoogle}>
          <Button type="submit" variant="outline" className="w-full">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-teal underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
