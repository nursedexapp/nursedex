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
      const { AccountExistsNotice } =
        await import("@/lib/email/templates/AccountExistsNotice");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "You already have a NurseDex account",
        react: AccountExistsNotice(data),
      };
    },
    "account exists notice",
  );
}
