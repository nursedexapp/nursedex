import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  planLabel: z.string().min(1),
  amount: z.string().min(1),
  nextRenewalLabel: z.string().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { RenewalSuccess } =
        await import("@/lib/email/templates/RenewalSuccess");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Your NurseDex ${data.planLabel} subscription renewed`,
        react: RenewalSuccess(data),
      };
    },
    "renewal success",
  );
}
