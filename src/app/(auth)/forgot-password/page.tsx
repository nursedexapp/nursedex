"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await forgotPassword(formData);

    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(result.success);
    }
    setLoading(false);
  }

  return (
    <Card className="border-sage/20">
      <CardHeader className="text-center">
        <Link href="/" className="font-heading text-2xl font-semibold text-teal mb-2 block">
          NurseDex
        </Link>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter your email and we will send you a reset link.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
            {error}
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-teal underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
