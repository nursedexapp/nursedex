import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  // What is keeping her out, worked out by the cron from her own profile
  // (#940). Required, with no default: a default would silently send every
  // nurse the same sentence again, which is the thing this replaced.
  gaps: z.array(z.enum(["content", "care_type"])).min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { to, firstName, gaps } = data;
      const { NotListedNudge } =
        await import("@/lib/email/templates/NotListedNudge");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to,
        replyTo: "support@nursedex.com",
        subject: "Families cannot see your NurseDex profile yet",
        react: NotListedNudge({ firstName, gaps }),
      };
    },
    "Not listed nudge",
  );
}
