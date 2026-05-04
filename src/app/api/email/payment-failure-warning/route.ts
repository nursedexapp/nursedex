import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  dayNumber: z.union([z.literal(1), z.literal(2)]),
  planLabel: z.string().min(1),
  consequenceLabel: z.string().min(1),
  portalUrl: z.string().url(),
});

export async function POST(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const { Resend } = await import("resend");
    const { PaymentFailureWarning } =
      await import("@/lib/email/templates/PaymentFailureWarning");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject: `Day ${parsed.data.dayNumber} of 3: payment failed on NurseDex`,
      react: PaymentFailureWarning(parsed.data),
    });
    if (error) {
      console.error("[email] payment failure warning send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] payment failure warning error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
