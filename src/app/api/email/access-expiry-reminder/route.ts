import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  daysUntilExpiry: z.number().int().min(1).max(60),
  expiryDateLabel: z.string().min(1),
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
    const { AccessExpiryReminder } = await import(
      "@/lib/email/templates/AccessExpiryReminder"
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject:
        parsed.data.daysUntilExpiry === 1
          ? "Your NurseDex access ends tomorrow"
          : `Your NurseDex access ends in ${parsed.data.daysUntilExpiry} days`,
      react: AccessExpiryReminder(parsed.data),
    });
    if (error) {
      console.error("[email] access expiry reminder send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] access expiry reminder error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
