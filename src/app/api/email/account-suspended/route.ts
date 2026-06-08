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
      const { AccountSuspended } =
        await import("@/lib/email/templates/AccountSuspended");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Your NurseDex account is temporarily suspended",
        react: AccountSuspended(data),
      };
    },
    "account suspended",
  );
}
