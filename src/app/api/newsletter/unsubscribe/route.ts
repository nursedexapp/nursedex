import { NextRequest, NextResponse } from "next/server";
import { unsubscribeNewsletter } from "@/lib/newsletter/actions";

// RFC 8058 one-click unsubscribe target for the newsletter's
// List-Unsubscribe header. Mail clients (Gmail, Apple Mail, etc.) POST here
// to unsubscribe in place; a 2xx is all they need.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const outcome = await unsubscribeNewsletter(token);
  // A 2xx is the mail client's whole signal, so returning one regardless told
  // Gmail the person was unsubscribed when the write never landed, and Gmail
  // then told THEM (#847). A 5xx says we could not do it, which is the truth
  // and which clients retry. "invalid" still gets a 200: there is no such
  // subscriber, so there is nothing left to do.
  if (outcome === "unavailable") {
    return new NextResponse(null, { status: 503 });
  }
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
