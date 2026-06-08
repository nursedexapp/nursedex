import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  reason: z.string().min(1).max(1000),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { AccountRemoved } =
        await import("@/lib/email/templates/AccountRemoved");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Your NurseDex account has been removed",
        react: AccountRemoved(data),
      };
    },
    "account removed",
  );
}
