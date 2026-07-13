import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { constantTimeEqual } from "@/lib/security/constant-time";

const SITE_PASSWORD = process.env.SITE_PASSWORD;

// Sentry SaaS ingest host for the project's actual production DSN (#393).
// DSNs are meant to be public/shareable, not secrets.
const SENTRY_INGEST_HOST = "https://o4511116810584064.ingest.us.sentry.io";

// Per-request nonce lets Next.js's own framework-injected inline scripts
// (RSC payload streaming) run under a strict CSP: Next parses the response's
// CSP header during SSR and auto-attaches the nonce to those scripts. No
// 'strict-dynamic': Cloudflare Turnstile's script (src/components/reveals/
// TurnstileWidget.tsx) is trusted by its own origin instead, which avoids
// threading a nonce prop through the client components that render it.
// Where the browser posts CSP violation reports (#537). report-uri is the
// widely supported (if deprecated) directive; report-to is the modern one and
// needs the Reporting-Endpoints header set below. Both point at the same
// route, which filters noise and records real gaps in Sentry.
const CSP_REPORT_PATH = "/api/csp-report";

// The Supabase origin this deployment actually talks to, taken from the URL it
// is configured with rather than hardcoded.
//
// It used to be the literal `https://*.supabase.co`, which allowed the browser
// to reach ANY Supabase project on the internet, and only Supabase projects. So
// it was both too loose for production (every other tenant's project was an
// allowed destination) and too tight for anywhere else: a local or CI stack runs
// on http://127.0.0.1:54321, so the browser's PUT of a nurse's photo straight to
// storage was blocked by CSP, and the nurse onboarding journey could not be
// exercised outside production at all (#485).
//
// Deriving it does both jobs: production narrows to its one project, and a local
// stack is allowed to be local. The old wildcard stays as the fallback, so a
// missing env var can never produce a CSP that blocks Supabase entirely.
const SUPABASE_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

const SUPABASE_HTTP = SUPABASE_ORIGIN ?? "https://*.supabase.co";
const SUPABASE_WS = SUPABASE_ORIGIN
  ? SUPABASE_ORIGIN.replace(/^http/, "ws")
  : "wss://*.supabase.co";

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${SUPABASE_HTTP} data:`,
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_HTTP} ${SUPABASE_WS} ${SENTRY_INGEST_HOST}`,
    "frame-src https://challenges.cloudflare.com https://www.youtube.com https://player.vimeo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
    "report-to csp-endpoint",
  ].join("; ");
}

function applySecurityHeaders(
  response: NextResponse,
  csp: string,
): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  // Names the report-to group referenced in the CSP above.
  response.headers.set(
    "Reporting-Endpoints",
    `csp-endpoint="${CSP_REPORT_PATH}"`,
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Password gate for the internal design surfaces: /brand* and
  // /logo-exploration. /brand-login is itself under /brand, so let it
  // through to avoid a redirect loop.
  const path = request.nextUrl.pathname;

  // Server-to-server endpoints (Stripe webhook, cron jobs, the Supabase auth
  // email hook) never carry a browser session, so skip the auth-refresh
  // round-trip to Supabase on every one of those requests.
  if (
    path.startsWith("/api/stripe/webhook") ||
    path.startsWith("/api/cron") ||
    path === "/api/auth/send-email" ||
    // Browser-posted CSP violation reports carry no session; skip the refresh.
    path === "/api/csp-report"
  ) {
    return applySecurityHeaders(NextResponse.next(), csp);
  }

  const isGated =
    path.startsWith("/brand") || path.startsWith("/logo-exploration");
  if (isGated && path !== "/brand-login") {
    if (SITE_PASSWORD) {
      const authCookie = request.cookies.get("site-auth");
      // Constant-time so the cookie value can't be recovered a character at a
      // time via response timing. constantTimeEqual (not the node:crypto
      // verifier) because this runs on the edge runtime.
      if (!constantTimeEqual(authCookie?.value ?? "", SITE_PASSWORD)) {
        const loginUrl = new URL("/brand-login", request.url);
        loginUrl.searchParams.set("from", path);
        return applySecurityHeaders(NextResponse.redirect(loginUrl), csp);
      }
    }
  }

  // Forward the nonce so Server Components can read it via
  // headers().get("x-nonce") if a third-party script ever needs it directly.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const requestWithNonce = new NextRequest(request, {
    headers: requestHeaders,
  });

  // Supabase session refresh for all other routes
  const response = await updateSession(requestWithNonce);
  return applySecurityHeaders(response, csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
