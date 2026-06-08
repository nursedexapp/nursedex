import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  planLabel: z.string().min(1),
  accessUntilLabel: z.string().min(1),
  isFamily: z.boolean(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { CancellationConfirmation } =
        await import("@/lib/email/templates/CancellationConfirmation");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Your NurseDex ${data.planLabel} subscription is cancelling`,
        react: CancellationConfirmation(data),
      };
    },
    "cancellation confirmation",
  );
}
