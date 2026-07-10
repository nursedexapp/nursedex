import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    // Split so an injected <style> block is blocked while our dynamic inline
    // style attributes (14 files, mostly the brand pages and per-item computed
    // values) keep working (#538). style-src-elem nonces framework <style>
    // tags and allows the external stylesheet; style-src-attr allows inline
    // style="" attributes, which a nonce cannot cover. The plain style-src is
    // the fallback for browsers without the granular directives, kept at
    // today's value so nothing regresses there.
    "style-src 'self' 'unsafe-inline'",
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' https://*.supabase.co data:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${SENTRY_INGEST_HOST}`,
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
      if (authCookie?.value !== SITE_PASSWORD) {
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
