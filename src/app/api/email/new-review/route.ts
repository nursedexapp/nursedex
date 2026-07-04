import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyBearerSecret } from "@/lib/security/shared-secret";

const schema = z.object({
  nurseUserId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().min(1).max(50),
});

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!verifyBearerSecret(authHeader, process.env.CRON_SECRET)) {
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

  const { nurseUserId, rating, reviewerName } = parsed.data;

  // Look up the nurse's email + first name. We use the service-role client
  // because this route runs from a server-to-server fetch with no user
  // session.
  const supabase = createServiceRoleClient();
  const { data: nurse, error: lookupError } = await supabase
    .from("users")
    .select("email, first_name")
    .eq("id", nurseUserId)
    .maybeSingle();

  if (lookupError || !nurse) {
    return NextResponse.json({ error: "Nurse not found" }, { status: 404 });
  }
  try {
    const { Resend } = await import("resend");
    const { NewReview } = await import("@/lib/email/templates/NewReview");

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: nurse.email,
      replyTo: "support@nursedex.com",
      subject: `New ${rating}-star review on NurseDex`,
      react: NewReview({
        firstName: nurse.first_name ?? undefined,
        rating,
        reviewerName,
      }),
    });

    if (error) {
      console.error("[email] New review send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email] New review error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
