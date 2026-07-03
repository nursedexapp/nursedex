"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

interface ErrorProps {
  error: Error & { digest?: string };
}

/**
 * Root error boundary. Reports to Sentry and renders a minimal branded
 * screen with a Go Home link. Per the launch UX call we don't surface a
 * Try Again button to avoid loops on persistent errors.
 */
export default function RootError({ error }: ErrorProps) {
  useEffect(() => {
    console.error("[root-error-boundary]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="bg-warm-white mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-teal font-mono text-sm font-medium tracking-wider">
        Something went wrong
      </p>
      <h1 className="font-heading text-soft-black mt-2 text-3xl font-semibold sm:text-4xl">
        We hit a snag
      </h1>
      <p className="text-soft-black-light mt-3 max-w-md text-base">
        Our team has been notified. Heading home is your safest bet from here.
      </p>
      <Link
        href="/"
        className="bg-teal hover:bg-teal-dark mt-7 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        Go home
      </Link>
      {error.digest && (
        <p className="text-muted-foreground mt-6 font-mono text-xs">
          Error ref: {error.digest}
        </p>
      )}
    </main>
  );
}
