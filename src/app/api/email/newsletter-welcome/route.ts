import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { NewsletterWelcome } =
        await import("@/lib/email/templates/NewsletterWelcome");
      return {
        from: "NurseDex <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Welcome to the NurseDex newsletter",
        react: NewsletterWelcome(),
      };
    },
    "newsletter welcome",
  );
}
