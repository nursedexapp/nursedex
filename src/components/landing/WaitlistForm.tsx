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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
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
      className="font-body text-sage-light hover:text-warm-white inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
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

  const isSignedUp =
    submitState === "success" || submitState === "already" || hasSignedUp;

  if (isSignedUp) {
    if (isHeader) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="text-teal h-4 w-4" />
          <p className="font-body text-teal text-sm font-medium">
            You&apos;re on the list!
          </p>
        </div>
      );
    }

    return (
      <div
        className={`rounded-xl px-6 py-8 text-center ${
          isFooter
            ? "bg-teal-dark/40 mx-auto max-w-md border border-white/20"
            : "border border-white/15 bg-white/10"
        }`}
      >
        <CheckCircle
          className={`mx-auto mb-3 h-8 w-8 ${isFooter ? "text-sage-light" : "text-teal-light"}`}
        />
        <p className="font-heading text-warm-white text-xl">
          {message || "You're on the list!"}
        </p>
        <p className="font-body text-sage-light mt-4 text-sm">
          Know someone who would love NurseDex?
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <CopyLinkButton />
          <a
            href={`sms:?body=${encodeURIComponent("Check out NurseDex, a new directory for finding trusted caregivers in New York: https://nursedex.com")}`}
            className="font-body text-sage-light hover:text-warm-white inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
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
        className="relative flex items-center gap-2"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-0 w-0 overflow-hidden"
        >
          <input
            {...register("honeypot")}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: "-9999px" }}
          />
        </div>
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
            className="border-sage-light/60 font-body text-soft-black placeholder:text-soft-black-light/50 focus:border-teal focus:ring-teal/30 h-9 w-40 rounded-lg border bg-white px-3 text-sm focus:ring-1 focus:outline-none disabled:opacity-60 sm:w-48"
          />
          {(errors.email || submitState === "error") && (
            <p className="font-body text-error absolute top-full left-0 mt-1 text-xs whitespace-nowrap">
              {errors.email?.message || message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitState === "submitting"}
          className="bg-teal font-body text-warm-white hover:bg-teal-dark focus:ring-teal/40 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none disabled:opacity-60"
        >
          {submitState === "submitting" ? (
            <>
              <Spinner className="h-3.5 w-3.5" /> Joining...
            </>
          ) : (
            "Join"
          )}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={`relative flex w-full items-stretch justify-center gap-3 sm:items-start ${isFooter ? "mx-auto max-w-md flex-col sm:flex-row" : "mx-auto max-w-lg flex-col sm:flex-row"}`}
    >
      {/* Honeypot: hidden from real users, bots will fill it */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-0 w-0 overflow-hidden"
      >
        <input
          {...register("honeypot")}
          tabIndex={-1}
          autoComplete="off"
          style={{ position: "absolute", left: "-9999px" }}
        />
      </div>

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
          className={`font-body h-12 w-full rounded-lg px-4 focus:ring-2 focus:outline-none disabled:opacity-60 ${
            isFooter
              ? "border-sage-light bg-warm-white text-soft-black placeholder:text-soft-black-light/50 focus:border-teal-light focus:ring-warm-white/30 border"
              : "text-soft-black placeholder:text-soft-black-light/50 border border-white/60 bg-white/90 focus:border-white focus:ring-white/30"
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
        className={`font-body inline-flex h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-6 font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60 sm:w-auto ${
          isFooter
            ? "bg-warm-white text-teal-dark hover:bg-cream focus:ring-warm-white/40 hover:scale-[1.02]"
            : "bg-warm-white text-teal-dark hover:bg-cream focus:ring-warm-white/40 hover:scale-[1.02]"
        }`}
      >
        {submitState === "submitting" ? (
          <>
            <Spinner /> Joining...
          </>
        ) : (
          "Join the Waitlist"
        )}
      </button>
    </form>
  );
}
