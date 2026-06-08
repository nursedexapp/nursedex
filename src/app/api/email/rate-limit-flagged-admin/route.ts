import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  flaggedCount: z.number().int().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { RateLimitFlaggedAdmin } =
        await import("@/lib/email/templates/RateLimitFlaggedAdmin");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Rate limit flagged: ${data.flaggedCount} family account${data.flaggedCount === 1 ? "" : "s"}`,
        react: RateLimitFlaggedAdmin(data),
      };
    },
    "rate limit flagged admin",
  );
}
