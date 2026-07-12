/* eslint-disable local/require-pending-button -- These are static design mocks of
   the auth screens. Their `loading` flags are simulated, nothing here calls a
   server action, and there is no hung request to show. The real login, signup and
   reset screens they illustrate are on the primitive (#655). */
"use client";

import { useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Mail,
  Stethoscope,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function BrowserChrome({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="bg-soft-black-light/30 hidden items-center gap-2 rounded-t-xl px-4 py-3 sm:flex">
        <div className="flex gap-1.5">
          <div className="bg-error/60 h-3 w-3 rounded-full" />
          <div className="bg-warning/60 h-3 w-3 rounded-full" />
          <div className="bg-success/60 h-3 w-3 rounded-full" />
        </div>
        <div className="bg-soft-black/40 ml-4 flex-1 rounded-md px-4 py-1.5">
          <span className="font-body text-warm-white/40 text-[11px]">
            {url}
          </span>
        </div>
      </div>
      <div className="bg-warm-white min-h-[500px] overflow-hidden rounded-xl shadow-2xl sm:rounded-t-none sm:rounded-b-xl">
        {children}
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
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
  );
}

function SandboxLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="bg-success h-2 w-2 animate-pulse rounded-full" />
      <span className="font-body text-sage/50 text-[10px] tracking-widest uppercase">
        Interactive {children}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  1. Login Sandbox                                                   */
/* ------------------------------------------------------------------ */

function LoginSandbox() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setShowResend(false);

    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      if (email === "unconfirmed@example.com") {
        setError("Please confirm your email address before signing in.");
        setShowResend(true);
      } else if (password === "wrong") {
        setError("Invalid email or password. Please try again.");
      } else {
        setSuccess(
          "Signed in successfully! (This is a sandbox, nothing actually happened.)",
        );
      }
      setLoading(false);
    }, 1500);
  }

  function handleResend() {
    setError(null);
    setShowResend(false);
    setSuccess("Confirmation email sent! Check your inbox. (Sandbox)");
  }

  return (
    <BrowserChrome url="nursedex.com/login">
      <div className="grid min-h-[520px] lg:grid-cols-2">
        {/* Brand panel */}
        <div className="bg-teal relative flex flex-col justify-center overflow-hidden px-10 py-16">
          <div className="border-warm-white/10 absolute -top-20 -right-20 h-72 w-72 rounded-full border" />
          <div className="border-warm-white/[0.07] absolute -bottom-16 -left-16 h-48 w-48 rounded-full border" />
          <div className="relative max-w-xs">
            <div className="bg-teal-dark mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
              <span className="font-heading text-warm-white text-lg leading-none font-semibold tracking-[-0.06em]">
                ND
              </span>
            </div>
            <p className="font-heading text-warm-white text-2xl font-semibold tracking-[-0.02em]">
              NurseDex
            </p>
            <p className="font-heading text-sage-light/80 mt-1 text-sm italic">
              Find care that feels like family.
            </p>
            <p className="text-sage-light mt-8 text-xs leading-relaxed">
              The nurse directory built for Long Island. Connect with families
              and nurses in your community.
            </p>
            <div className="mt-6 space-y-3">
              {[
                {
                  text: "Long Island focused",
                  detail: "Nassau, Suffolk, and Queens",
                },
                {
                  text: "Your data stays private",
                  detail: "Never shared without consent",
                },
                {
                  text: "Always free for families",
                  detail: "Search and connect at no cost",
                },
              ].map((s) => (
                <div key={s.text} className="flex items-start gap-2.5">
                  <Check
                    className="text-cream mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.5}
                  />
                  <div>
                    <span className="text-warm-white block text-xs font-medium">
                      {s.text}
                    </span>
                    <span className="text-sage-light/70 text-[10px]">
                      {s.detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center px-10 py-16">
          <div className="w-full max-w-sm">
            <h2 className="font-heading mb-1 text-xl">Welcome back</h2>
            <p className="text-soft-black-light mb-6 text-xs">
              Your Long Island care community is waiting.{" "}
              <span className="text-teal cursor-pointer font-medium underline">
                New here? Create an account
              </span>
            </p>

            <button className="border-sage-dark/50 hover:bg-sage-light/20 mb-5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border transition-colors">
              <GoogleLogo />
              <span className="font-body text-sm font-semibold">
                Continue with Google
              </span>
            </button>

            <div className="relative my-5">
              <div className="bg-sage/20 h-px" />
              <span className="bg-warm-white text-soft-black-light absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-[10px]">
                or continue with email
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div
                  role="alert"
                  className="bg-error/10 text-error rounded-lg px-4 py-3 text-sm"
                >
                  {error}
                  {showResend && (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-teal mt-1 block cursor-pointer text-sm font-medium underline"
                    >
                      Resend confirmation email
                    </button>
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

              <div>
                <label className="text-soft-black mb-1 block text-xs font-medium">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="text-soft-black placeholder:text-soft-black-light focus:border-teal focus:ring-teal/20 h-10 w-full rounded-lg border border-[#C8D2D0] px-3 text-sm transition-all outline-none focus:ring-2"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-soft-black text-xs font-medium">
                    Password
                  </label>
                  <span className="text-teal cursor-pointer text-sm font-medium underline">
                    Forgot password?
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="text-soft-black focus:border-teal focus:ring-teal/20 h-10 w-full rounded-lg border border-[#C8D2D0] px-3 pr-10 text-sm transition-all outline-none focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="text-soft-black-light/50 mt-4 text-center text-[10px] italic">
              Try: &quot;unconfirmed@example.com&quot; to see resend flow, or
              password &quot;wrong&quot; to see error
            </p>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  2. Signup Sandbox                                                  */
/* ------------------------------------------------------------------ */

function SignupSandbox() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { email?: string; password?: string } = {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1500);
  }

  if (success) {
    return (
      <BrowserChrome url="nursedex.com/signup/confirm?email=you@example.com">
        <div
          className="px-10 py-12"
          style={{ animation: "fadeIn 0.4s ease-out" }}
        >
          {/* Progress - step 2 active */}
          <div className="mb-8 flex items-center justify-center gap-2">
            {[
              { label: "Create account", active: false, past: true },
              { label: "Confirm email", active: true, past: false },
              { label: "Choose role", active: false, past: false },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-2 w-2 rounded-full ${step.active || step.past ? "bg-teal" : "bg-sage/40"}`}
                  />
                  <span
                    className={`text-[10px] ${step.active ? "text-soft-black font-medium" : step.past ? "text-teal" : "text-soft-black-light"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div
                    className={`h-px w-6 ${step.past ? "bg-teal" : "bg-sage/30"}`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className="bg-teal/10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full">
              <Mail className="text-teal h-7 w-7" />
            </div>
            <h2 className="font-heading mb-2 text-xl">Check your email</h2>
            <p className="text-soft-black-light mx-auto max-w-xs text-xs leading-relaxed">
              We sent a confirmation link to{" "}
              <strong className="text-soft-black">{email}</strong>. Click the
              link to activate your account.
            </p>
            <button
              onClick={() => {
                setSuccess(false);
                setEmail("");
                setPassword("");
              }}
              className="text-teal mt-6 cursor-pointer text-sm font-medium underline"
            >
              Back to signup (reset sandbox)
            </button>
          </div>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome url="nursedex.com/signup">
      <div className="flex items-center justify-center px-10 py-12">
        <div className="w-full max-w-sm">
          {/* Progress */}
          <div className="mb-6 flex items-center gap-2">
            {[
              { label: "Create account", active: true },
              { label: "Confirm email", active: false },
              { label: "Choose role", active: false },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-2 w-2 rounded-full ${step.active ? "bg-teal" : "bg-sage/40"}`}
                  />
                  <span
                    className={`text-[10px] ${step.active ? "text-soft-black font-medium" : "text-soft-black-light"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && <div className="bg-sage/30 h-px w-6" />}
              </div>
            ))}
          </div>

          <h2 className="font-heading mb-1 text-xl">Join NurseDex</h2>
          <p className="text-soft-black-light mb-6 text-xs">
            Create your free account.{" "}
            <span className="text-teal cursor-pointer font-medium underline">
              Sign in instead
            </span>
          </p>

          <button className="border-sage-dark/50 hover:bg-sage-light/20 mb-5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border transition-colors">
            <GoogleLogo />
            <span className="font-body text-sm font-semibold">
              Continue with Google
            </span>
          </button>

          <div className="relative my-5">
            <div className="bg-sage/20 h-px" />
            <span className="bg-warm-white text-soft-black-light absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-[10px]">
              or continue with email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-soft-black mb-1 block text-xs font-medium">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="your@email.com"
                className={`text-soft-black placeholder:text-soft-black-light h-10 w-full rounded-lg border px-3 text-sm transition-all outline-none ${
                  fieldErrors.email
                    ? "border-error ring-error/20 ring-2"
                    : "focus:border-teal focus:ring-teal/20 border-[#C8D2D0] focus:ring-2"
                }`}
              />
              {fieldErrors.email && (
                <p className="text-error mt-1 text-xs">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="text-soft-black mb-1 block text-xs font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="At least 8 characters"
                  className={`text-soft-black placeholder:text-soft-black-light h-10 w-full rounded-lg border px-3 pr-10 text-sm transition-all outline-none ${
                    fieldErrors.password
                      ? "border-error ring-error/20 ring-2"
                      : "focus:border-teal focus:ring-teal/20 border-[#C8D2D0] focus:ring-2"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="text-error mt-1 text-xs">
                  {fieldErrors.password}
                </p>
              ) : password.length > 0 && password.length < 8 ? (
                <p className="text-soft-black-light mt-1 text-xs">
                  {password.length}/8 characters
                </p>
              ) : null}
            </div>

            <p className="text-soft-black-light text-center text-[10px]">
              By clicking Join NurseDex, you agree to our{" "}
              <span className="text-teal underline">Terms</span> and{" "}
              <span className="text-teal underline">Privacy Policy</span>.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join NurseDex"
              )}
            </button>
          </form>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  3. Role Select Sandbox                                             */
/* ------------------------------------------------------------------ */

function RoleSelectSandbox() {
  const [selected, setSelected] = useState<"nurse" | "family" | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function handleContinue() {
    if (!selected) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 1200);
  }

  if (done) {
    return (
      <BrowserChrome url="nursedex.com/dashboard">
        <div
          className="px-10 py-16 text-center"
          style={{ animation: "fadeIn 0.4s ease-out" }}
        >
          <div className="bg-success/10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full">
            <Check className="text-success h-7 w-7" strokeWidth={2.5} />
          </div>
          <h2 className="font-heading mb-2 text-xl">You are all set!</h2>
          <p className="text-soft-black-light mx-auto max-w-xs text-xs">
            You selected{" "}
            <strong className="text-soft-black">
              {selected === "nurse" ? "I am a nurse" : "I need care"}
            </strong>
            . In the real app, you would now see your personalized dashboard.
          </p>
          <button
            onClick={() => {
              setDone(false);
              setSelected(null);
            }}
            className="text-teal mt-6 cursor-pointer text-sm font-medium underline"
          >
            Try again (reset sandbox)
          </button>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome url="nursedex.com/role-select">
      <div className="px-10 py-12">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[
            { label: "Create account", active: false, past: true },
            { label: "Confirm email", active: false, past: true },
            { label: "Choose role", active: true, past: false },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 rounded-full ${step.active || step.past ? "bg-teal" : "bg-sage/40"}`}
                />
                <span
                  className={`text-[10px] ${step.active ? "text-soft-black font-medium" : step.past ? "text-teal" : "text-soft-black-light"}`}
                >
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div
                  className={`h-px w-6 ${step.past ? "bg-teal" : "bg-sage/30"}`}
                />
              )}
            </div>
          ))}
        </div>

        <h2 className="font-heading mb-1 text-xl">
          How will you use NurseDex?
        </h2>
        <p className="text-soft-black-light mb-6 text-xs">
          This helps us personalize your experience.
        </p>

        <div className="mb-5 grid grid-cols-2 gap-4">
          <button
            onClick={() => !loading && setSelected("nurse")}
            className={`cursor-pointer rounded-xl p-5 text-left transition-all ${
              selected === "nurse"
                ? "border-teal ring-teal/20 border-2 ring-2"
                : "border-sage/20 hover:border-sage border"
            }`}
          >
            <Stethoscope className="text-teal mb-2 h-5 w-5" />
            <p className="font-heading text-soft-black mb-1 text-sm font-semibold">
              I am a nurse
            </p>
            <p className="text-soft-black-light text-[10px] leading-relaxed">
              Create a profile, get found by families, and grow your practice.
            </p>
          </button>
          <button
            onClick={() => !loading && setSelected("family")}
            className={`cursor-pointer rounded-xl p-5 text-left transition-all ${
              selected === "family"
                ? "border-teal ring-teal/20 border-2 ring-2"
                : "border-sage/20 hover:border-sage border"
            }`}
          >
            <Heart className="text-teal mb-2 h-5 w-5" />
            <p className="font-heading text-soft-black mb-1 text-sm font-semibold">
              I need care
            </p>
            <p className="text-soft-black-light text-[10px] leading-relaxed">
              Find qualified nurses in your area and connect with them directly.
            </p>
          </button>
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </BrowserChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  4. Forgot Password Sandbox                                         */
/* ------------------------------------------------------------------ */

function ForgotPasswordSandbox() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1200);
  }

  if (sent) {
    return (
      <BrowserChrome url="nursedex.com/forgot-password/sent">
        <div
          className="px-10 py-16 text-center"
          style={{ animation: "fadeIn 0.4s ease-out" }}
        >
          <div className="bg-teal/10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full">
            <Mail className="text-teal h-7 w-7" />
          </div>
          <h2 className="font-heading mb-2 text-xl">Check your email</h2>
          <p className="text-soft-black-light mx-auto max-w-xs text-xs leading-relaxed">
            If an account exists with that email, we sent a password reset link.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="text-teal mt-6 cursor-pointer text-sm font-medium underline"
          >
            Back to sign in (reset sandbox)
          </button>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome url="nursedex.com/forgot-password">
      <div className="px-10 py-12">
        <h2 className="font-heading mb-1 text-xl">Reset your password</h2>
        <p className="text-soft-black-light mb-6 text-xs">
          Enter your email and we will send you a reset link.{" "}
          <span className="text-teal cursor-pointer font-medium underline">
            Back to sign in
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div
              role="alert"
              className="bg-error/10 text-error rounded-lg px-4 py-3 text-sm"
            >
              {error}
            </div>
          )}
          <div>
            <label className="text-soft-black mb-1 block text-xs font-medium">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="text-soft-black placeholder:text-soft-black-light focus:border-teal focus:ring-teal/20 h-10 w-full rounded-lg border border-[#C8D2D0] px-3 text-sm transition-all outline-none focus:ring-2"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      </div>
    </BrowserChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  5. Reset Password Sandbox                                          */
/* ------------------------------------------------------------------ */

function ResetPasswordSandbox() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirm?: string;
  }>({});
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { password?: string; confirm?: string } = {};

    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    if (password && confirm && password !== confirm) {
      errors.confirm = "Passwords do not match.";
    } else if (!confirm) {
      errors.confirm = "Please confirm your password.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1200);
  }

  if (success) {
    return (
      <BrowserChrome url="nursedex.com/login?message=password_reset">
        <div
          className="px-10 py-12"
          style={{ animation: "fadeIn 0.4s ease-out" }}
        >
          <div
            role="status"
            className="bg-success/10 text-success mb-4 rounded-lg px-4 py-3 text-sm"
          >
            Password reset successfully. Sign in with your new password.
          </div>
          <h2 className="font-heading mb-1 text-xl">Welcome back</h2>
          <p className="text-soft-black-light mb-4 text-xs">
            Your Long Island care community is waiting.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              setPassword("");
              setConfirm("");
              setFieldErrors({});
            }}
            className="text-teal cursor-pointer text-sm font-medium underline"
          >
            Reset sandbox
          </button>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome url="nursedex.com/reset-password">
      <div className="px-10 py-12">
        <h2 className="font-heading mb-1 text-xl">Set new password</h2>
        <p className="text-soft-black-light mb-6 text-xs">
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-soft-black mb-1 block text-xs font-medium">
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                placeholder="At least 8 characters"
                className={`text-soft-black placeholder:text-soft-black-light h-10 w-full rounded-lg border px-3 pr-10 text-sm transition-all outline-none ${
                  fieldErrors.password
                    ? "border-error ring-error/20 ring-2"
                    : "focus:border-teal focus:ring-teal/20 border-[#C8D2D0] focus:ring-2"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-error mt-1 text-xs">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className="text-soft-black mb-1 block text-xs font-medium">
              Confirm password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setFieldErrors((p) => ({ ...p, confirm: undefined }));
                }}
                className={`text-soft-black h-10 w-full rounded-lg border px-3 pr-10 text-sm transition-all outline-none ${
                  fieldErrors.confirm
                    ? "border-error ring-error/20 ring-2"
                    : "focus:border-teal focus:ring-teal/20 border-[#C8D2D0] focus:ring-2"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="text-soft-black-light hover:text-soft-black absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center transition-colors"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {fieldErrors.confirm && (
              <p className="text-error mt-1 text-xs">{fieldErrors.confirm}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-teal text-warm-white hover:bg-teal-dark disabled:bg-teal/50 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update password"
            )}
          </button>
        </form>
      </div>
    </BrowserChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export function LoginSandboxSection() {
  return (
    <div>
      <SandboxLabel>Login</SandboxLabel>
      <LoginSandbox />
    </div>
  );
}

export function SignupSandboxSection() {
  return (
    <div>
      <SandboxLabel>Signup to Confirmation</SandboxLabel>
      <SignupSandbox />
    </div>
  );
}

export function RoleSelectSandboxSection() {
  return (
    <div>
      <SandboxLabel>Role Selection</SandboxLabel>
      <RoleSelectSandbox />
    </div>
  );
}

export function ForgotPasswordSandboxSection() {
  return (
    <div>
      <SandboxLabel>Forgot Password</SandboxLabel>
      <ForgotPasswordSandbox />
    </div>
  );
}

export function ResetPasswordSandboxSection() {
  return (
    <div>
      <SandboxLabel>Reset Password</SandboxLabel>
      <ResetPasswordSandbox />
    </div>
  );
}
