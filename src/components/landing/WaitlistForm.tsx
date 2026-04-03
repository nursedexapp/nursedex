"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Link as LinkIcon, Check } from "lucide-react";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "h-4 w-4"}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText("https://nursedex.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-body text-sm text-sage-light transition-colors hover:bg-white/10 hover:text-warm-white"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied!
        </>
      ) : (
        <>
          <LinkIcon className="h-3.5 w-3.5" />
          Copy link
        </>
      )}
    </button>
  );
}

const schema = z.object({
  email: z.email("Please enter a valid email address."),
  honeypot: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type WaitlistFormProps = {
  role: "nurse" | "family";
  referralSource?: string;
  variant?: "hero" | "footer" | "header";
  onSignup?: () => void;
  hasSignedUp?: boolean;
};

type SubmitState = "idle" | "submitting" | "success" | "already" | "error";

export function WaitlistForm({
  role,
  referralSource,
  variant = "hero",
  onSignup,
  hasSignedUp,
}: WaitlistFormProps) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    setSubmitState("submitting");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          role,
          honeypot: data.honeypot,
          referral_source: referralSource,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setSubmitState(result.alreadySignedUp ? "already" : "success");
        setMessage(result.message);
        posthog.capture(ANALYTICS_EVENTS.WAITLIST_SIGNUP, {
          role,
          already_signed_up: !!result.alreadySignedUp,
        });
        onSignup?.();
      } else {
        setSubmitState("error");
        setMessage(result.message);
      }
    } catch {
      setSubmitState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const isFooter = variant === "footer";
  const isHeader = variant === "header";

  const isSignedUp = submitState === "success" || submitState === "already" || hasSignedUp;

  if (isSignedUp) {
    if (isHeader) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-teal" />
          <p className="font-body text-sm font-medium text-teal">You&apos;re on the list!</p>
        </div>
      );
    }

    return (
      <div
        className={`rounded-xl px-6 py-8 text-center ${
          isFooter
            ? "max-w-md mx-auto border border-white/20 bg-teal-dark/40"
            : "border border-white/15 bg-white/10"
        }`}
      >
        <CheckCircle className={`mx-auto mb-3 h-8 w-8 ${isFooter ? "text-sage-light" : "text-teal-light"}`} />
        <p className="font-heading text-xl text-warm-white">
          {message || "You're on the list!"}
        </p>
        <p className="mt-4 font-body text-sm text-sage-light">
          Know someone who would love NurseDex?
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <CopyLinkButton />
          <a
            href={`sms:?body=${encodeURIComponent("Check out NurseDex, a new directory for finding trusted caregivers on Long Island: https://nursedex.com")}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-body text-sm text-sage-light transition-colors hover:bg-white/10 hover:text-warm-white"
          >
            Text a friend
          </a>
        </div>
      </div>
    );
  }

  if (isHeader) {
    return (
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex items-center gap-2"
      >
        <input
          {...register("honeypot")}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <div className="relative">
          <label htmlFor="email-header" className="sr-only">
            Email address
          </label>
          <input
            {...register("email")}
            id="email-header"
            type="email"
            placeholder="Enter your email"
            disabled={submitState === "submitting"}
            className="h-9 w-40 rounded-lg border border-sage-light/60 bg-white px-3 font-body text-sm text-soft-black placeholder:text-soft-black-light/50 disabled:opacity-60 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30 sm:w-48"
          />
          {(errors.email || submitState === "error") && (
            <p className="absolute left-0 top-full mt-1 whitespace-nowrap font-body text-xs text-error">
              {errors.email?.message || message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitState === "submitting"}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-teal px-4 font-body text-sm font-medium text-warm-white transition-colors hover:bg-teal-dark disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-1"
        >
          {submitState === "submitting" ? <><Spinner className="h-3.5 w-3.5" /> Joining...</> : "Join"}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={`flex w-full items-stretch justify-center gap-3 sm:items-start ${isFooter ? "max-w-md mx-auto flex-col sm:flex-row" : "max-w-lg mx-auto flex-col sm:flex-row"}`}
    >
      {/* Honeypot: hidden from real users, bots will fill it */}
      <input
        {...register("honeypot")}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <div className="flex-1">
        <label htmlFor={`email-${variant}`} className="sr-only">
          Email address
        </label>
        <input
          {...register("email")}
          id={`email-${variant}`}
          type="email"
          placeholder="Enter your email"
          disabled={submitState === "submitting"}
          className={`h-12 w-full rounded-lg px-4 font-body disabled:opacity-60 focus:outline-none focus:ring-2 ${
            isFooter
              ? "border border-sage-light bg-warm-white text-soft-black placeholder:text-soft-black-light/50 focus:border-teal-light focus:ring-warm-white/30"
              : "border border-white/60 bg-white/90 text-soft-black placeholder:text-soft-black-light/50 focus:border-white focus:ring-white/30"
          }`}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-[#F5A3A6]">{errors.email.message}</p>
        )}
        {submitState === "error" && (
          <p className="mt-1 text-sm text-[#F5A3A6]">{message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitState === "submitting"}
        className={`inline-flex h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-6 font-body font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 sm:w-auto ${
          isFooter
            ? "bg-warm-white text-teal-dark hover:bg-cream hover:scale-[1.02] focus:ring-warm-white/40"
            : "bg-warm-white text-teal-dark hover:bg-cream hover:scale-[1.02] focus:ring-warm-white/40"
        }`}
      >
        {submitState === "submitting" ? <><Spinner /> Joining...</> : "Join the Waitlist"}
      </button>
    </form>
  );
}
