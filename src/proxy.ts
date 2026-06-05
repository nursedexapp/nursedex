import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const SITE_PASSWORD = process.env.SITE_PASSWORD;

export async function proxy(request: NextRequest) {
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
    path === "/api/auth/send-email"
  ) {
    return NextResponse.next();
  }

  const isGated =
    path.startsWith("/brand") || path.startsWith("/logo-exploration");
  if (isGated && path !== "/brand-login") {
    if (SITE_PASSWORD) {
      const authCookie = request.cookies.get("site-auth");
      if (authCookie?.value !== SITE_PASSWORD) {
        const loginUrl = new URL("/brand-login", request.url);
        loginUrl.searchParams.set("from", path);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // Supabase session refresh for all other routes
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
