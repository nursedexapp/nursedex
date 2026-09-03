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
      const { LicenceNumberNeeded } =
        await import("@/lib/email/templates/LicenceNumberNeeded");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to,
        replyTo: "support@nursedex.com",
        subject: "We need your license number for NurseDex",
        react: LicenceNumberNeeded({ firstName }),
      };
    },
    "Licence number needed",
  );
}
