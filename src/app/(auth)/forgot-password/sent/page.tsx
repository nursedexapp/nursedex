"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

export default function ForgotPasswordSentPage() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center py-8 text-center lg:min-h-0"
      style={{ animation: "fadeIn 0.4s ease-out" }}
    >
      <div className="bg-teal/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
        <Mail className="text-teal h-8 w-8" />
      </div>
      <h2 className="font-heading mb-2 text-2xl">Check your email</h2>
      <p className="text-muted-foreground mx-auto max-w-xs text-sm leading-relaxed">
        If an account exists with that email, we sent a password reset link.
      </p>
      <div className="mt-6">
        <Link href="/login" className="text-teal text-sm font-medium underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
