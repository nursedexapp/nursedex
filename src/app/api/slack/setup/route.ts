import { NextRequest, NextResponse } from "next/server";
import { OPS_CHANNEL_ID, slackPost } from "@/lib/slack/client";
import { newRequestButtonBlocks } from "@/lib/slack/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One-off helper that posts the persistent "New Request" button into
 * #projects-and-maintenance. Pin the resulting message so it stays at
 * the top of the channel. Guarded by ADMIN_SECRET.
 *
 *   curl -X POST https://nursedex.com/api/slack/setup \
 *     -H "x-admin-secret: $ADMIN_SECRET"
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posted = await slackPost("chat.postMessage", {
    channel: OPS_CHANNEL_ID,
    text: "Submit a new request",
    blocks: newRequestButtonBlocks(),
  });

  return NextResponse.json({ ok: true, ts: posted.ts });
}
