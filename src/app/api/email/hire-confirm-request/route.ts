import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  nurseFirstName: z.string().min(1).max(50),
  claimToken: z.uuid(),
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
    const { HireConfirmRequest } =
      await import("@/lib/email/templates/HireConfirmRequest");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject: `Did you hire ${parsed.data.nurseFirstName}?`,
      react: HireConfirmRequest(parsed.data),
    });
    if (error) {
      console.error("[email] hire confirm request send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] hire confirm request error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
