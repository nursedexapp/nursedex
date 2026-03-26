import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD!;

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("site-auth");
  if (authCookie?.value === SITE_PASSWORD) {
    return NextResponse.next();
  }

  // Allow the login API route through
  if (request.nextUrl.pathname === "/api/login") {
    return NextResponse.next();
  }

  // Redirect to login page
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.rewrite(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
