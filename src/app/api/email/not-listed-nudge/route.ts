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
      const { to, firstName } = data;
      const { NotListedNudge } = await import(
        "@/lib/email/templates/NotListedNudge"
      );
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to,
        replyTo: "support@nursedex.com",
        subject: "Families cannot see your NurseDex profile yet",
        react: NotListedNudge({ firstName }),
      };
    },
    "Not listed nudge",
  );
}
