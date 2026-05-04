import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  to: z.email(),
  reviewerName: z.string().min(1).max(50),
  verificationToken: z.uuid(),
});

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { to, reviewerName, verificationToken } = parsed.data;
  const verifyUrl = `https://nursedex.com/reviews/verify/${verificationToken}`;

  try {
    const { Resend } = await import("resend");
    const { VerifyReview } = await import("@/lib/email/templates/VerifyReview");

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to,
      replyTo: "support@nursedex.com",
      subject: "Confirm your NurseDex review",
      react: VerifyReview({ reviewerName, verifyUrl }),
    });

    if (error) {
      console.error("[email] Verify review send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] Verify review error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
