import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { HireFollowup } =
        await import("@/lib/email/templates/HireFollowup");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Did you find a nurse on NurseDex?",
        react: HireFollowup(data),
      };
    },
    "hire followup",
  );
}
