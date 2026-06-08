import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  postTitle: z.string(),
  authorName: z.string(),
  body: z.string(),
  moderateUrl: z.string().url(),
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
    const { CommentSubmitted } = await import(
      "@/lib/email/templates/CommentSubmitted"
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Blog <noreply@nursedex.com>",
      to: "support@nursedex.com",
      subject: "[Blog] New comment awaiting review",
      react: CommentSubmitted(parsed.data),
    });
    if (error) {
      console.error("[email] comment submitted send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] comment submitted error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
