import { NextResponse } from "next/server";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import { resolveVisibleNursePhoto } from "@/lib/nurses/photo-owner";

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
 * This path is stable while the photo is, so the optimizer caches it and the
 * signing happens once behind that cache rather than once per visitor.
 *
 * Who may call it: anyone. Nurse photos are public on the directory (decision,
 * 1 September 2026, #873). Whose photos it will serve: only nurses the public
 * may see, checked by the shared visibility filter, so this cannot be used to
 * reach a photo the directory withholds.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await params;

  // The address is exactly `<nurse id>/<photo id>`. Anything else is refused
  // before it reaches Supabase rather than being sanitised into something
  // plausible. Neither segment is ever used to build a storage path, so a
  // traversal attempt cannot reach the bucket even if one got this far: the
  // path comes back from the nurse's own record.
  const badSegment = (s: string) =>
    !s || s === "." || s === ".." || s.includes("\\") || s.includes("/");
  if (segments.length !== 2 || segments.some(badSegment)) {
    return new NextResponse(null, { status: 400 });
  }
  const [userId, photoId] = segments;

  const path = await resolveVisibleNursePhoto(userId, photoId);
  if (!path) {
    return new NextResponse(null, { status: 404 });
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
