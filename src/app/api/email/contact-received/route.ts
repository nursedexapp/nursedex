import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  message: z.string().min(1).max(2000),
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
    const { ContactReceived } = await import(
      "@/lib/email/templates/ContactReceived"
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Contact <noreply@nursedex.com>",
      to: "support@nursedex.com",
      replyTo: parsed.data.email,
      subject: `[Contact form] ${parsed.data.name}`,
      react: ContactReceived(parsed.data),
    });
    if (error) {
      console.error("[email] contact received send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] contact received error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
