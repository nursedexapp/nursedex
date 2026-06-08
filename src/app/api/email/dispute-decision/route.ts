import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  recipientType: z.enum(["nurse", "reviewer"]),
  recipientName: z.string().optional(),
  decision: z.enum(["keep", "remove"]),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().min(1).max(50),
  notes: z.string().nullable(),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { DisputeDecision } =
        await import("@/lib/email/templates/DisputeDecision");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject:
          data.decision === "keep"
            ? "NurseDex: review dispute decision (kept)"
            : "NurseDex: review dispute decision (removed)",
        react: DisputeDecision(data),
      };
    },
    "dispute decision",
  );
}
