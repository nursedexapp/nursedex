import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { generateAndPostInvoice } from "@/lib/slack/invoice";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// The previous calendar month as "YYYY-MM" (UTC).
function previousMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monthly on the 1st (Vercel cron). Posts the previous month's invoice to
 * #projects-and-maintenance. Also callable manually with the ADMIN_SECRET
 * header and an optional ?month=YYYY-MM to (re)generate any month.
 *
 *   curl "https://nursedex.com/api/cron/consulting-invoice?month=2026-06" \
 *     -H "x-admin-secret: $ADMIN_SECRET"
 */
export async function GET(request: NextRequest) {
  const cronUnauth = verifyCronAuth(request);
  const isAdmin =
    !!process.env.ADMIN_SECRET &&
    request.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
  if (cronUnauth && !isAdmin) return cronUnauth;

  const month = request.nextUrl.searchParams.get("month") || previousMonth();
  try {
    const result = await generateAndPostInvoice(month);
    return NextResponse.json({ ok: true, month, ...result });
  } catch (err) {
    console.error("Consulting invoice failed:", err);
    return NextResponse.json(
      { error: "Invoice generation failed" },
      { status: 500 },
    );
  }
}
