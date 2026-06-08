import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  saveCount: z.number().int().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { UpgradeNudge } =
        await import("@/lib/email/templates/UpgradeNudge");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Families are saving your profile on NurseDex",
        react: UpgradeNudge(data),
      };
    },
    "upgrade nudge",
  );
}
