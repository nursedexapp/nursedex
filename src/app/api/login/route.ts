import { NextRequest, NextResponse } from "next/server";
import { verifySecretHeader } from "@/lib/security/shared-secret";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const sitePassword = process.env.SITE_PASSWORD;

  // Constant-time and fail-closed: if SITE_PASSWORD is unset, verifySecretHeader
  // returns false rather than accepting an empty or "undefined" password.
  if (
    verifySecretHeader(
      typeof password === "string" ? password : null,
      sitePassword,
    )
  ) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("site-auth", sitePassword as string, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return response;
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
