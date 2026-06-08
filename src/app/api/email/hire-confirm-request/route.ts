import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  nurseFirstName: z.string().min(1).max(50),
  claimToken: z.uuid(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { HireConfirmRequest } =
        await import("@/lib/email/templates/HireConfirmRequest");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: `Did you hire ${data.nurseFirstName}?`,
        react: HireConfirmRequest(data),
      };
    },
    "hire confirm request",
  );
}
