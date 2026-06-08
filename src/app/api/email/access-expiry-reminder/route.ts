import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  daysUntilExpiry: z.number().int().min(1).max(60),
  expiryDateLabel: z.string().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { AccessExpiryReminder } =
        await import("@/lib/email/templates/AccessExpiryReminder");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject:
          data.daysUntilExpiry === 1
            ? "Your NurseDex access ends tomorrow"
            : `Your NurseDex access ends in ${data.daysUntilExpiry} days`,
        react: AccessExpiryReminder(data),
      };
    },
    "access expiry reminder",
  );
}
