"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [passwordLength, setPasswordLength] = useState(0);

  function validateFields(formData: FormData): boolean {
    const errors: { email?: string; password?: string } = {};
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(errors);
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    if (!validateFields(formData)) return;

    setLoading(true);
    const email = formData.get("email") as string;
    const result = await signUp(formData);

    if (result.error) {
      setError(result.error);
      requestAnimationFrame(() => errorRef.current?.focus());
      setLoading(false);
    } else if (result.success) {
      router.push(`/signup/confirm?email=${encodeURIComponent(email)}`);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Join NurseDex</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create your free account.{" "}
          <Link href="/login" className="text-teal font-medium underline">
            Sign in instead
          </Link>
        </p>
      </div>

      <GoogleSignInButton />

      <div className="relative my-6">
        <Separator className="bg-sage/20" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
          or continue with email
        </span>
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
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            placeholder="your@email.com"
            required
            autoFocus
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className="h-11"
            onChange={() => fieldErrors.email && setFieldErrors((prev) => ({ ...prev, email: undefined }))}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-xs text-error">{fieldErrors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className="h-11 pr-10"
              onChange={(e) => {
                setPasswordLength(e.target.value.length);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center cursor-pointer text-soft-black-light hover:text-soft-black transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {fieldErrors.password ? (
            <p id="password-error" className="text-xs text-error">{fieldErrors.password}</p>
          ) : passwordLength > 0 && passwordLength < 8 ? (
            <p className="text-xs text-muted-foreground">{passwordLength}/8 characters</p>
          ) : null}
        </div>

        <input type="hidden" name="tos" value="on" />

        <p className="text-xs text-muted-foreground text-center">
          By clicking Join NurseDex, you agree to our{" "}
          <Link href="/terms" className="text-teal underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-teal underline">
            Privacy Policy
          </Link>.
        </p>

        <Button
          type="submit"
          className="w-full h-11 bg-teal text-warm-white font-semibold text-base hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : "Join NurseDex"}
        </Button>
      </form>
    </div>
  );
}
