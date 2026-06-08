import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  confirmUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { NewsletterConfirm } =
        await import("@/lib/email/templates/NewsletterConfirm");
      return {
        from: "NurseDex <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Confirm your NurseDex subscription",
        react: NewsletterConfirm({ confirmUrl: data.confirmUrl }),
      };
    },
    "newsletter confirm",
  );
}
