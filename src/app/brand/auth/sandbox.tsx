"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, Heart, Loader2, Mail, Stethoscope } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="hidden sm:flex bg-soft-black-light/30 rounded-t-xl px-4 py-3 items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-error/60" />
          <div className="w-3 h-3 rounded-full bg-warning/60" />
          <div className="w-3 h-3 rounded-full bg-success/60" />
        </div>
        <div className="flex-1 bg-soft-black/40 rounded-md px-4 py-1.5 ml-4">
          <span className="font-body text-[11px] text-warm-white/40">{url}</span>
        </div>
      </div>
      <div className="bg-warm-white rounded-xl sm:rounded-t-none sm:rounded-b-xl overflow-hidden shadow-2xl min-h-[500px]">
        {children}
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SandboxLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
      <span className="font-body text-[10px] uppercase tracking-widest text-sage/50">
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
        setSuccess("Signed in successfully! (This is a sandbox, nothing actually happened.)");
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
      <div className="grid lg:grid-cols-2 min-h-[520px]">
        {/* Brand panel */}
        <div className="relative bg-teal px-10 py-16 flex flex-col justify-center overflow-hidden">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full border border-warm-white/10" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full border border-warm-white/[0.07]" />
          <div className="relative max-w-xs">
            <div className="h-12 w-12 rounded-xl bg-teal-dark flex items-center justify-center mb-4">
              <span className="font-heading text-lg font-semibold text-warm-white tracking-[-0.06em] leading-none">ND</span>
            </div>
            <p className="font-heading text-2xl font-semibold text-warm-white tracking-[-0.02em]">NurseDex</p>
            <p className="font-heading text-sm italic text-sage-light/80 mt-1">Find care that feels like family.</p>
            <p className="text-sage-light text-xs leading-relaxed mt-8">The nurse directory built for Long Island. Connect with families and nurses in your community.</p>
            <div className="mt-6 space-y-3">
              {[
                { text: "Long Island focused", detail: "Nassau, Suffolk, and Queens" },
                { text: "Your data stays private", detail: "Never shared without consent" },
                { text: "Always free for families", detail: "Search and connect at no cost" },
              ].map((s) => (
                <div key={s.text} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cream" strokeWidth={2.5} />
                  <div>
                    <span className="text-warm-white text-xs font-medium block">{s.text}</span>
                    <span className="text-sage-light/70 text-[10px]">{s.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center px-10 py-16">
          <div className="w-full max-w-sm">
            <h2 className="font-heading text-xl mb-1">Welcome back</h2>
            <p className="text-xs text-soft-black-light mb-6">
              Your Long Island care community is waiting.{" "}
              <span className="text-teal font-medium underline cursor-pointer">New here? Create an account</span>
            </p>

            <button className="w-full h-10 rounded-lg border border-sage-dark/50 flex items-center justify-center gap-2 mb-5 cursor-pointer hover:bg-sage-light/20 transition-colors">
              <GoogleLogo />
              <span className="font-body text-sm font-semibold">Continue with Google</span>
            </button>

            <div className="relative my-5">
              <div className="h-px bg-sage/20" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-warm-white px-3 text-[10px] text-soft-black-light">or continue with email</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div role="alert" className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
                  {error}
                  {showResend && (
                    <button type="button" onClick={handleResend} className="mt-1 block text-teal text-sm font-medium underline cursor-pointer">
                      Resend confirmation email
                    </button>
                  )}
                </div>
              )}
              {success && (
                <div role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">{success}</div>
              )}

              <div>
                <label className="text-xs font-medium text-soft-black block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-10 rounded-lg border border-[#C8D2D0] px-3 text-sm text-soft-black placeholder:text-soft-black-light outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-soft-black">Password</label>
                  <span className="text-sm text-teal font-medium underline cursor-pointer">Forgot password?</span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[#C8D2D0] px-3 pr-10 text-sm text-soft-black outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center cursor-pointer text-soft-black-light hover:text-soft-black transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg bg-teal text-warm-white font-semibold text-sm cursor-pointer hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : "Sign in"}
              </button>
            </form>

            <p className="text-[10px] text-soft-black-light/50 text-center mt-4 italic">
              Try: &quot;unconfirmed@example.com&quot; to see resend flow, or password &quot;wrong&quot; to see error
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
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
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
        <div className="px-10 py-12" style={{ animation: "fadeIn 0.4s ease-out" }}>
          {/* Progress - step 2 active */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[
              { label: "Create account", active: false, past: true },
              { label: "Confirm email", active: true, past: false },
              { label: "Choose role", active: false, past: false },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${step.active || step.past ? "bg-teal" : "bg-sage/40"}`} />
                  <span className={`text-[10px] ${step.active ? "text-soft-black font-medium" : step.past ? "text-teal" : "text-soft-black-light"}`}>{step.label}</span>
                </div>
                {i < arr.length - 1 && <div className={`h-px w-6 ${step.past ? "bg-teal" : "bg-sage/30"}`} />}
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-teal/10 flex items-center justify-center">
              <Mail className="h-7 w-7 text-teal" />
            </div>
            <h2 className="font-heading text-xl mb-2">Check your email</h2>
            <p className="text-soft-black-light text-xs leading-relaxed max-w-xs mx-auto">
              We sent a confirmation link to <strong className="text-soft-black">{email}</strong>. Click the link to activate your account.
            </p>
            <button
              onClick={() => { setSuccess(false); setEmail(""); setPassword(""); }}
              className="mt-6 text-sm text-teal font-medium underline cursor-pointer"
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
          <div className="flex items-center gap-2 mb-6">
            {[
              { label: "Create account", active: true },
              { label: "Confirm email", active: false },
              { label: "Choose role", active: false },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${step.active ? "bg-teal" : "bg-sage/40"}`} />
                  <span className={`text-[10px] ${step.active ? "text-soft-black font-medium" : "text-soft-black-light"}`}>{step.label}</span>
                </div>
                {i < arr.length - 1 && <div className="h-px w-6 bg-sage/30" />}
              </div>
            ))}
          </div>

          <h2 className="font-heading text-xl mb-1">Join NurseDex</h2>
          <p className="text-xs text-soft-black-light mb-6">
            Create your free account. <span className="text-teal font-medium underline cursor-pointer">Sign in instead</span>
          </p>

          <button className="w-full h-10 rounded-lg border border-sage-dark/50 flex items-center justify-center gap-2 mb-5 cursor-pointer hover:bg-sage-light/20 transition-colors">
            <GoogleLogo />
            <span className="font-body text-sm font-semibold">Continue with Google</span>
          </button>

          <div className="relative my-5">
            <div className="h-px bg-sage/20" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-warm-white px-3 text-[10px] text-soft-black-light">or continue with email</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-soft-black block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="your@email.com"
                className={`w-full h-10 rounded-lg border px-3 text-sm text-soft-black placeholder:text-soft-black-light outline-none transition-all ${
                  fieldErrors.email ? "border-error ring-2 ring-error/20" : "border-[#C8D2D0] focus:border-teal focus:ring-2 focus:ring-teal/20"
                }`}
              />
              {fieldErrors.email && <p className="text-xs text-error mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-soft-black block mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder="At least 8 characters"
                  className={`w-full h-10 rounded-lg border px-3 pr-10 text-sm text-soft-black placeholder:text-soft-black-light outline-none transition-all ${
                    fieldErrors.password ? "border-error ring-2 ring-error/20" : "border-[#C8D2D0] focus:border-teal focus:ring-2 focus:ring-teal/20"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center cursor-pointer text-soft-black-light hover:text-soft-black transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="text-xs text-error mt-1">{fieldErrors.password}</p>
              ) : password.length > 0 && password.length < 8 ? (
                <p className="text-xs text-soft-black-light mt-1">{password.length}/8 characters</p>
              ) : null}
            </div>

            <p className="text-[10px] text-soft-black-light text-center">
              By clicking Join NurseDex, you agree to our <span className="text-teal underline">Terms</span> and <span className="text-teal underline">Privacy Policy</span>.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-teal text-warm-white font-semibold text-sm cursor-pointer hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : "Join NurseDex"}
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
        <div className="text-center px-10 py-16" style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="h-7 w-7 text-success" strokeWidth={2.5} />
          </div>
          <h2 className="font-heading text-xl mb-2">You are all set!</h2>
          <p className="text-soft-black-light text-xs max-w-xs mx-auto">
            You selected <strong className="text-soft-black">{selected === "nurse" ? "I am a nurse" : "I need care"}</strong>. In the real app, you would now see your personalized dashboard.
          </p>
          <button
            onClick={() => { setDone(false); setSelected(null); }}
            className="mt-6 text-sm text-teal font-medium underline cursor-pointer"
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
        <div className="flex items-center gap-2 mb-6">
          {[
            { label: "Create account", active: false, past: true },
            { label: "Confirm email", active: false, past: true },
            { label: "Choose role", active: true, past: false },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${step.active || step.past ? "bg-teal" : "bg-sage/40"}`} />
                <span className={`text-[10px] ${step.active ? "text-soft-black font-medium" : step.past ? "text-teal" : "text-soft-black-light"}`}>{step.label}</span>
              </div>
              {i < arr.length - 1 && <div className={`h-px w-6 ${step.past ? "bg-teal" : "bg-sage/30"}`} />}
            </div>
          ))}
        </div>

        <h2 className="font-heading text-xl mb-1">How will you use NurseDex?</h2>
        <p className="text-xs text-soft-black-light mb-6">This helps us personalize your experience.</p>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <button
            onClick={() => !loading && setSelected("nurse")}
            className={`text-left rounded-xl p-5 transition-all cursor-pointer ${
              selected === "nurse"
                ? "border-2 border-teal ring-2 ring-teal/20"
                : "border border-sage/20 hover:border-sage"
            }`}
          >
            <Stethoscope className="h-5 w-5 text-teal mb-2" />
            <p className="font-heading text-sm font-semibold text-soft-black mb-1">I am a nurse</p>
            <p className="text-[10px] text-soft-black-light leading-relaxed">Create a profile, get found by families, and grow your practice.</p>
          </button>
          <button
            onClick={() => !loading && setSelected("family")}
            className={`text-left rounded-xl p-5 transition-all cursor-pointer ${
              selected === "family"
                ? "border-2 border-teal ring-2 ring-teal/20"
                : "border border-sage/20 hover:border-sage"
            }`}
          >
            <Heart className="h-5 w-5 text-teal mb-2" />
            <p className="font-heading text-sm font-semibold text-soft-black mb-1">I need care</p>
            <p className="text-[10px] text-soft-black-light leading-relaxed">Find qualified nurses in your area and connect with them directly.</p>
          </button>
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="w-full h-10 rounded-lg bg-teal text-warm-white font-semibold text-sm cursor-pointer hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : "Continue"}
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
        <div className="text-center px-10 py-16" style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-teal/10 flex items-center justify-center">
            <Mail className="h-7 w-7 text-teal" />
          </div>
          <h2 className="font-heading text-xl mb-2">Check your email</h2>
          <p className="text-soft-black-light text-xs leading-relaxed max-w-xs mx-auto">
            If an account exists with that email, we sent a password reset link.
          </p>
          <button
            onClick={() => { setSent(false); setEmail(""); }}
            className="mt-6 text-sm text-teal font-medium underline cursor-pointer"
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
        <h2 className="font-heading text-xl mb-1">Reset your password</h2>
        <p className="text-xs text-soft-black-light mb-6">
          Enter your email and we will send you a reset link.{" "}
          <span className="text-teal font-medium underline cursor-pointer">Back to sign in</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div role="alert" className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
          )}
          <div>
            <label className="text-xs font-medium text-soft-black block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full h-10 rounded-lg border border-[#C8D2D0] px-3 text-sm text-soft-black placeholder:text-soft-black-light outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-teal text-warm-white font-semibold text-sm cursor-pointer hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : "Send reset link"}
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
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
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
        <div className="px-10 py-12" style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success mb-4">
            Password reset successfully. Sign in with your new password.
          </div>
          <h2 className="font-heading text-xl mb-1">Welcome back</h2>
          <p className="text-xs text-soft-black-light mb-4">Your Long Island care community is waiting.</p>
          <button
            onClick={() => { setSuccess(false); setPassword(""); setConfirm(""); setFieldErrors({}); }}
            className="text-sm text-teal font-medium underline cursor-pointer"
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
        <h2 className="font-heading text-xl mb-1">Set new password</h2>
        <p className="text-xs text-soft-black-light mb-6">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-medium text-soft-black block mb-1">New password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                placeholder="At least 8 characters"
                className={`w-full h-10 rounded-lg border px-3 pr-10 text-sm text-soft-black placeholder:text-soft-black-light outline-none transition-all ${
                  fieldErrors.password ? "border-error ring-2 ring-error/20" : "border-[#C8D2D0] focus:border-teal focus:ring-2 focus:ring-teal/20"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center cursor-pointer text-soft-black-light hover:text-soft-black transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && <p className="text-xs text-error mt-1">{fieldErrors.password}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-soft-black block mb-1">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setFieldErrors((p) => ({ ...p, confirm: undefined })); }}
                className={`w-full h-10 rounded-lg border px-3 pr-10 text-sm text-soft-black outline-none transition-all ${
                  fieldErrors.confirm ? "border-error ring-2 ring-error/20" : "border-[#C8D2D0] focus:border-teal focus:ring-2 focus:ring-teal/20"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center cursor-pointer text-soft-black-light hover:text-soft-black transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.confirm && <p className="text-xs text-error mt-1">{fieldErrors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-teal text-warm-white font-semibold text-sm cursor-pointer hover:bg-teal-dark transition-colors disabled:bg-teal/50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : "Update password"}
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
