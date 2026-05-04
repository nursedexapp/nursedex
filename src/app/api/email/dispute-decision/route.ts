import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  recipientType: z.enum(["nurse", "reviewer"]),
  recipientName: z.string().optional(),
  decision: z.enum(["keep", "remove"]),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().min(1).max(50),
  notes: z.string().nullable(),
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
    const { DisputeDecision } =
      await import("@/lib/email/templates/DisputeDecision");

    const resend = new Resend(process.env.RESEND_API_KEY);
    const subject =
      parsed.data.decision === "keep"
        ? "NurseDex: review dispute decision (kept)"
        : "NurseDex: review dispute decision (removed)";

    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject,
      react: DisputeDecision(parsed.data),
    });
    if (error) {
      console.error("[email] dispute decision send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] dispute decision error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
