import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  planType: z.enum(["nurse_featured", "family_access"]),
  amount: z.string().min(1),
  nextRenewalLabel: z.string().min(1),
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
    const resend = new Resend(process.env.RESEND_API_KEY);

    const isFamily = parsed.data.planType === "family_access";
    const TemplateModule = isFamily
      ? await import("@/lib/email/templates/SubscriptionConfirmedFamily")
      : await import("@/lib/email/templates/SubscriptionConfirmedNurse");
    const Template = isFamily
      ? (TemplateModule as typeof import("@/lib/email/templates/SubscriptionConfirmedFamily"))
          .SubscriptionConfirmedFamily
      : (TemplateModule as typeof import("@/lib/email/templates/SubscriptionConfirmedNurse"))
          .SubscriptionConfirmedNurse;

    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: parsed.data.to,
      replyTo: "support@nursedex.com",
      subject: isFamily
        ? "Family Access is active on NurseDex"
        : "Welcome to NurseDex Featured",
      react: Template({
        firstName: parsed.data.firstName,
        amount: parsed.data.amount,
        nextRenewalLabel: parsed.data.nextRenewalLabel,
      }),
    });
    if (error) {
      console.error("[email] subscription confirmed send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] subscription confirmed error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
