import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const schema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z
    .array(
      z.object({
        email: z.email(),
        unsubscribeUrl: z.string().url(),
        listUnsubscribeUrl: z.string().url(),
      }),
    )
    .min(1)
    .max(100), // Resend batch limit
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
  const { subject, body, recipients } = parsed.data;
  try {
    const { Resend } = await import("resend");
    const { NewsletterIssue } =
      await import("@/lib/email/templates/NewsletterIssue");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.batch.send(
      recipients.map((r) => ({
        from: "NurseDex <noreply@nursedex.com>",
        to: r.email,
        subject,
        // RFC 8058: lets Gmail/Apple Mail show a native one-click unsubscribe
        // (and is required for bulk senders).
        headers: {
          "List-Unsubscribe": `<${r.listUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        react: NewsletterIssue({
          subject,
          body,
          unsubscribeUrl: r.unsubscribeUrl,
        }),
      })),
    );
    if (error) {
      console.error("[email] newsletter batch send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] newsletter batch error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
