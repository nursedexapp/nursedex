import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const { Resend } = await import("resend");
    const { AccountExistsNotice } = await import(
      "@/lib/email/templates/AccountExistsNotice"
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject: "You already have a NurseDex account",
      react: AccountExistsNotice(parsed.data),
    });
    if (error) {
      console.error("[email] account exists notice send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] account exists notice error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
