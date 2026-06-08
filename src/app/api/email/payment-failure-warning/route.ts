import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  dayNumber: z.union([z.literal(1), z.literal(2)]),
  planLabel: z.string().min(1),
  consequenceLabel: z.string().min(1),
  portalUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { PaymentFailureWarning } =
        await import("@/lib/email/templates/PaymentFailureWarning");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Day ${data.dayNumber} of 3: payment failed on NurseDex`,
        react: PaymentFailureWarning(data),
      };
    },
    "payment failure warning",
  );
}
