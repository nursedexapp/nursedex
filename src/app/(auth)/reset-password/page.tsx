"use client";

import { useRef, useState } from "react";
import { resetPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function validateFields(formData: FormData): boolean {
    const errors: { password?: string; confirmPassword?: string } = {};
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    } else if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    }

    setFieldErrors(errors);
    if (errors.password) passwordRef.current?.focus();
    else if (errors.confirmPassword) confirmRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    if (!validateFields(formData)) return;

    setLoading(true);
    const result = await resetPassword(formData);

    if (result?.error) {
      setError(result.error);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-2xl">Set new password</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose a new password for your account.
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
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              required
              autoFocus
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={
                fieldErrors.password ? "password-error" : undefined
              }
              className="h-11 pr-10"
              onChange={() =>
                fieldErrors.password &&
                setFieldErrors((prev) => ({ ...prev, password: undefined }))
              }
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
          {fieldErrors.password && (
            <p id="password-error" className="text-error text-xs">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              ref={confirmRef}
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={
                fieldErrors.confirmPassword ? "confirm-error" : undefined
              }
              className="h-11 pr-10"
              onChange={() =>
                fieldErrors.confirmPassword &&
                setFieldErrors((prev) => ({
                  ...prev,
                  confirmPassword: undefined,
                }))
              }
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p id="confirm-error" className="text-error text-xs">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 h-11 w-full text-base font-semibold transition-colors disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </div>
  );
}
