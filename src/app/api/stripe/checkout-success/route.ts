import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe redirects here after a successful Checkout session. We don't trust
 * this redirect to grant access (the webhook does that). We just bounce the
 * user to wherever they were trying to go.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  // Reject open-redirects: only allow same-origin paths.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return NextResponse.redirect(new URL(safeNext, request.url));
}
