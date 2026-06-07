import { NextRequest, NextResponse } from "next/server";
import { slackPost, verifySlackRequest } from "@/lib/slack/client";
import { homeView } from "@/lib/slack/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: { type: string; user?: string; tab?: string };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const valid = verifySlackRequest(
    raw,
    request.headers.get("x-slack-signature"),
    request.headers.get("x-slack-request-timestamp"),
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(raw) as SlackEvent;

  // Slack's one-time Request URL verification handshake.
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Render the App Home tab with the New Request button when opened.
  if (
    body.type === "event_callback" &&
    body.event?.type === "app_home_opened" &&
    body.event.tab === "home" &&
    body.event.user
  ) {
    try {
      await slackPost("views.publish", {
        user_id: body.event.user,
        view: homeView(),
      });
    } catch (err) {
      console.error("Failed to publish App Home view:", err);
    }
  }

  return new NextResponse(null, { status: 200 });
}
