import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const weekly = z.object({
  profileViews: z.number().int().min(0),
  saves: z.number().int().min(0),
  reveals: z.number().int().min(0),
});

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  thisWeek: weekly,
  lastWeek: weekly,
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const { FeaturedAnalytics } =
        await import("@/lib/email/templates/FeaturedAnalytics");
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: "Your weekly NurseDex recap",
        react: FeaturedAnalytics(data),
      };
    },
    "featured analytics",
  );
}
