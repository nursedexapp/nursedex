import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  approachingCount: z.number().int().min(0),
  overdueCount: z.number().int().min(0),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { SlaAlertAdmin } =
        await import("@/lib/email/templates/SlaAlertAdmin");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Verification queue: ${data.overdueCount} overdue, ${data.approachingCount} approaching`,
        react: SlaAlertAdmin(data),
      };
    },
    "sla alert",
  );
}
