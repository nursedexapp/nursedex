"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

export default function ForgotPasswordSentPage() {
  return (
    <div className="text-center flex flex-col items-center justify-center min-h-[40vh] lg:min-h-0 py-8" style={{ animation: "fadeIn 0.4s ease-out" }}>
      <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-teal/10 flex items-center justify-center">
        <Mail className="h-8 w-8 text-teal" />
      </div>
      <h2 className="font-heading text-2xl mb-2">Check your email</h2>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
        If an account exists with that email, we sent a password reset link.
      </p>
      <div className="mt-6">
        <Link href="/login" className="text-sm text-teal font-medium underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
