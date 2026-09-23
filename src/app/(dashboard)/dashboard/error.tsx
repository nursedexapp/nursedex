"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

interface ErrorProps {
  error: Error & { digest?: string };
}

export default function DashboardError({ error }: ErrorProps) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", error);
    try {
      Sentry.captureException(error);
    } catch (reportFailure) {
      // A throw here would take down the one screen explaining the failure.
      console.error(
        "[dashboard-error-boundary] could not report to Sentry",
        reportFailure,
      );
    }
  }, [error]);

  return (
    <div className="bg-warm-white flex min-h-screen items-center justify-center p-6">
      <div className="border-sage/20 bg-warm-white max-w-md rounded-xl border p-8 text-center">
        <p className="text-teal font-mono text-xs font-medium tracking-wider">
          Dashboard error
        </p>
        <h1 className="font-heading text-soft-black mt-2 text-xl font-semibold">
          Something on your dashboard didn&apos;t load
        </h1>
        <p className="text-soft-black-light mt-2 text-sm">
          Our team has been notified. You can head home or sign back in if this
          keeps happening.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/"
            className="bg-teal hover:bg-teal-dark inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Go home
          </Link>
        </div>
        {error.digest && (
          <p className="text-muted-foreground mt-4 font-mono text-xs">
            Error ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
