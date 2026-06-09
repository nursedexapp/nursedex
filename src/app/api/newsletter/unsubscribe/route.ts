import { NextRequest, NextResponse } from "next/server";
import { unsubscribeNewsletter } from "@/lib/newsletter/actions";

// RFC 8058 one-click unsubscribe target for the newsletter's
// List-Unsubscribe header. Mail clients (Gmail, Apple Mail, etc.) POST here
// to unsubscribe in place; a 2xx is all they need.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  await unsubscribeNewsletter(token);
  return new NextResponse(null, { status: 200 });
}

// A human who opens the header link in a browser gets the friendly page.
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(
    new URL(
      `/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
      request.url,
    ),
  );
}
