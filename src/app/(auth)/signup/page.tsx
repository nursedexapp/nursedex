"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/actions";
import { setSurveyHandoffCookie } from "@/lib/family/actions";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  const [loadingMessage, setLoadingMessage] = useState("Joining...");

  // After 1.5s of pending, swap the copy to acknowledge the slow path so a
  // signup that waits on Supabase + email hook + Resend doesn't read as a
  // stuck spinner.
  useEffect(() => {
    if (!pending) {
      setLoadingMessage("Joining...");
      return;
    }
    const timer = setTimeout(() => {
      setLoadingMessage("Almost there...");
    }, 1500);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <Button
      type="submit"
      className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingMessage}
        </>
      ) : (
        "Join NurseDex"
      )}
    </Button>
  );
}

export default function SignUpPage() {
  const router = useRouter();

  // If the user arrived from /survey/results with their answers, persist
  // them to a cookie so they survive email confirmation + role select and
  // can be applied at the end of family onboarding.
  // Read directly from window.location to avoid useSearchParams() forcing
  // the whole signup page out of static prerendering.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const survey = new URLSearchParams(window.location.search).get("survey");
    if (survey) {
      setSurveyHandoffCookie(survey);
    }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  // Controlled so the email survives an action error (already-registered,
  // network blip, etc.). Password stays uncontrolled and resets on submit.
  const [email, setEmail] = useState("");
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

    const email = formData.get("email") as string;
    const result = await signUp(formData);

    if (result.error) {
      setError(result.error);
      requestAnimationFrame(() => errorRef.current?.focus());
    } else if (result.success) {
      router.push(`/signup/confirm?email=${encodeURIComponent(email)}`);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Join NurseDex</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Create your free account.{" "}
          <Link href="/login" className="text-teal-dark font-medium underline">
            Sign in instead
          </Link>
        </p>
      </div>

      <GoogleSignInButton />

      <div className="my-6 flex items-center gap-3">
        <div className="bg-sage/20 h-px flex-1" />
        <span className="text-muted-foreground text-xs">
          or continue with email
        </span>
        <div className="bg-sage/20 h-px flex-1" />
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
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-error text-xs">
              {fieldErrors.email}
            </p>
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
              aria-describedby={
                fieldErrors.password ? "password-error" : undefined
              }
              className="h-11 pr-10"
              onChange={(e) => {
                setPasswordLength(e.target.value.length);
                if (fieldErrors.password)
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
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
          {fieldErrors.password ? (
            <p id="password-error" className="text-error text-xs">
              {fieldErrors.password}
            </p>
          ) : passwordLength > 0 && passwordLength < 8 ? (
            <p className="text-muted-foreground text-xs">
              {passwordLength}/8 characters
            </p>
          ) : null}
        </div>

        <input type="hidden" name="tos" value="on" />

        <p className="text-muted-foreground text-center text-xs">
          By clicking Join NurseDex, you agree to our{" "}
          <Link href="/terms" className="text-teal-dark underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-teal-dark underline">
            Privacy Policy
          </Link>
          .
        </p>

        <SubmitButton />
      </form>
    </div>
  );
}
