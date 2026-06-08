import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  reviewLinkUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { ReviewInvite } =
        await import("@/lib/email/templates/ReviewInvite");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Build trust with reviews on NurseDex",
        react: ReviewInvite(data),
      };
    },
    "review invite",
  );
}
