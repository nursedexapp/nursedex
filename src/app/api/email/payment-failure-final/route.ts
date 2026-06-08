import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  planLabel: z.string().min(1),
  consequenceSummary: z.string().min(1),
  portalUrl: z.string().url(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { PaymentFailureFinal } =
        await import("@/lib/email/templates/PaymentFailureFinal");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Your ${data.planLabel} access has ended`,
        react: PaymentFailureFinal(data),
      };
    },
    "payment failure final",
  );
}
