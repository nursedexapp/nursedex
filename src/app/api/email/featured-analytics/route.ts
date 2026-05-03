import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const weekly = z.object({
  profileViews: z.number().int().min(0),
  saves: z.number().int().min(0),
  reveals: z.number().int().min(0),
});

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  thisWeek: weekly,
  lastWeek: weekly,
});

export async function POST(request: NextRequest) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const { Resend } = await import("resend");
    const { FeaturedAnalytics } = await import(
      "@/lib/email/templates/FeaturedAnalytics"
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject: "Your weekly NurseDex recap",
      react: FeaturedAnalytics(parsed.data),
    });
    if (error) {
      console.error("[email] featured analytics send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] featured analytics error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
