import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const SITE_PASSWORD = process.env.SITE_PASSWORD;

export async function proxy(request: NextRequest) {
  // Password gate: only for /brand pages
  if (request.nextUrl.pathname.startsWith("/brand")) {
    if (SITE_PASSWORD) {
      const authCookie = request.cookies.get("site-auth");
      if (authCookie?.value !== SITE_PASSWORD) {
        if (request.nextUrl.pathname === "/api/login"
          || request.nextUrl.pathname === "/brand-login") {
          return NextResponse.next();
        }
        const loginUrl = new URL("/brand-login", request.url);
        loginUrl.searchParams.set("from", request.nextUrl.pathname);
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
