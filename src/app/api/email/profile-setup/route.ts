import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  slug: z.string().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { to, firstName, slug } = data;
      const { ProfileSetupComplete } =
        await import("@/lib/email/templates/ProfileSetupComplete");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to,
        replyTo: "support@nursedex.com",
        subject: "Your NurseDex profile is set up!",
        react: ProfileSetupComplete({ firstName, slug }),
      };
    },
    "Profile setup",
  );
}
