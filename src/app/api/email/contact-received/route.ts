import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  subject: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { ContactReceived } =
        await import("@/lib/email/templates/ContactReceived");
      return {
        from: "NurseDex Contact <noreply@nursedex.com>",
        to: "support@nursedex.com",
        replyTo: data.email,
        subject: `[Contact form] ${data.subject}`,
        react: ContactReceived(data),
      };
    },
    "contact received",
  );
}
