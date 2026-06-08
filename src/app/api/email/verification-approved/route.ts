import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  slug: z.string().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { VerificationApproved } =
        await import("@/lib/email/templates/VerificationApproved");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Your NurseDex license is verified",
        react: VerificationApproved(data),
      };
    },
    "verification approved",
  );
}
