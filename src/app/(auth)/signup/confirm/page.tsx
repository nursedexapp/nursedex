"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resendConfirmation } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Loader2, Mail } from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse py-8 text-center">
          <div className="bg-sage/20 mx-auto mb-6 h-16 w-16 rounded-full" />
          <div className="bg-sage/20 mx-auto h-6 w-48 rounded" />
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}

function ConfirmContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resendLoading, setResendLoading] = useState(false);
  // Start with the cooldown already running. The original send happened the
  // moment the user landed here, so we mirror Supabase's per-email cooldown
  // so an immediate click doesn't get a "no email was sent" surprise.
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  async function handleResend() {
    if (!email) return;
    const formData = new FormData();
    formData.set("email", email);
    setResendMessage(null);
    setResendLoading(true);
    const result = await resendConfirmation(formData);
    setResendLoading(false);
    if (result.error) {
      setResendMessage(result.error);
    } else {
      setResendMessage("Sent! Check your inbox.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  if (!email) {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center py-8 text-center lg:min-h-0"
        style={{ animation: "fadeIn 0.4s ease-out" }}
      >
        <h2 className="font-heading mb-2 text-2xl">No email provided</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          It looks like you got here by accident.
        </p>
        <Link
          href="/signup"
          className="text-teal text-sm font-medium underline"
        >
          Go to sign up
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center py-8 text-center lg:min-h-0"
      style={{ animation: "fadeIn 0.4s ease-out" }}
    >
      <div className="bg-teal/10 animate-mail-arrive mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
        <Mail className="text-teal h-8 w-8" />
      </div>
      <h2 className="font-heading mb-2 text-2xl">Check your email</h2>
      <p className="text-muted-foreground mx-auto max-w-xs text-sm leading-relaxed">
        We sent a confirmation link to{" "}
        <strong className="text-soft-black">{email}</strong>. Click the link to
        activate your account.
      </p>
      <p className="text-muted-foreground/80 mx-auto mt-2 max-w-xs text-xs leading-relaxed">
        Don&apos;t see it? Check your spam or junk folder.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResend}
          disabled={resendLoading || resendCooldown > 0}
        >
          {resendLoading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Sending...
            </>
          ) : resendCooldown > 0 ? (
            `Resend available in ${resendCooldown}s`
          ) : (
            "Resend confirmation email"
          )}
        </Button>
        {resendMessage && (
          <p className="text-muted-foreground text-xs">{resendMessage}</p>
        )}
      </div>
    </div>
  );
}
