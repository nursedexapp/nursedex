"use client";

import { useEffect } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
}

/**
 * Replaces the root layout when an error is thrown inside it. Has to
 * own the <html> and <body> tags itself. Kept intentionally minimal:
 * we don't have access to fonts/styles here, so this is a
 * pure-inline-styles fallback.
 */
export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FCFAF6",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          color: "#2D3436",
        }}
      >
        <main
          style={{ maxWidth: 480, padding: "48px 24px", textAlign: "center" }}
        >
          <p
            style={{
              color: "#2A7B6F",
              fontSize: 13,
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            SOMETHING WENT WRONG
          </p>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              margin: "12px 0 12px",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            We hit a snag
          </h1>
          <p style={{ fontSize: 16, color: "#636E72", margin: 0 }}>
            Reload the page or head back to the homepage.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: 24,
              padding: "10px 18px",
              borderRadius: 8,
              backgroundColor: "#2A7B6F",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Go home
          </Link>
          {error.digest && (
            <p
              style={{
                marginTop: 24,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                color: "#9CA3AF",
              }}
            >
              Error ref: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
