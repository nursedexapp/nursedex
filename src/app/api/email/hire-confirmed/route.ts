import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  familyFirstName: z.string().min(1).max(50),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { HireConfirmed } =
        await import("@/lib/email/templates/HireConfirmed");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "A hire was just confirmed on NurseDex",
        react: HireConfirmed(data),
      };
    },
    "hire confirmed",
  );
}
