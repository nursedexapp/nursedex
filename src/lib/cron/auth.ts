import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Verify that a request to /api/cron/* came from Vercel's cron runner
 * (which sends `Authorization: Bearer <CRON_SECRET>`). Returns null on
 * pass, or a 401 NextResponse on fail.
 *
 * Vercel cron jobs run with the `Authorization` header set to
 * `Bearer ${CRON_SECRET}` from the project's environment variables.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
