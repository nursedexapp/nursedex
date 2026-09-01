import { NextResponse } from "next/server";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import { decodePhotoToken } from "@/lib/profile/photo-token";

export const runtime = "nodejs";

/**
 * The stable, cacheable address of a nurse photo (#871).
 *
 * Photos live in a private bucket, so they need a signed URL, and Supabase
 * mints a fresh token every time it signs. Embedding that in the markup made
 * the image URL different on every render, and Vercel's image optimizer keys
 * its cache on the source URL: it missed on 30 of 30 requests in production and
 * re-fetched and re-encoded every photo on every visit, which is what made the
 * directory take about thirty seconds on a phone.
 *
 * Who may call it: anyone. Nurse photos are public on the directory (decision,
 * 1 September 2026, #873). What it will serve: only a path our own server
 * encrypted into a token, so a caller cannot name a path or reach anything the
 * app did not itself put in a page. It does NOT look anything up, deliberately:
 * one page produces fifteen concurrent requests here, and a version that
 * queried the database on each one lost six of fifteen photos under that
 * fan-out.
 *
 * The cost of that choice, stated rather than hidden: a token minted while a
 * nurse was listed keeps working if she is later hidden, until the cache
 * expires. That is acceptable while photos are public and the token is
 * unguessable; it would not be if that decision were reversed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const path = decodePhotoToken(token);
  if (!path) {
    return new NextResponse(null, { status: 400 });
  }

  let signed: string | null;
  try {
    signed = await getSignedPhotoUrl(path);
  } catch (e) {
    console.error(
      `Could not sign nurse photo ${path}:`,
      e instanceof Error ? e.message : e,
    );
    return new NextResponse(null, { status: 502 });
  }

  // A signer that answers null is the same outcome for the visitor as one that
  // throws, so it gets the same treatment. Answering 307 with no destination
  // would report a success that serves nothing.
  if (!signed) {
    console.error(
      `Could not sign nurse photo ${path}:`,
      "signer returned null",
    );
    return new NextResponse(null, { status: 502 });
  }

  const res = NextResponse.redirect(signed, 307);
  // The whole point of the issue: let the optimizer and the browser keep it.
  // Well inside the signed URL's own 4 hour life, so a cached redirect can
  // never outlive the token it points at.
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res;
}
