import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { handleEmailRoute } from "@/lib/email/route-handler";

const schema = z.object({
  to: z.email(),
  firstName: z.string().optional(),
  planType: z.enum(["nurse_featured", "family_access"]),
  amount: z.string().min(1),
  nextRenewalLabel: z.string().min(1),
});

export function POST(request: NextRequest) {
  return handleEmailRoute(
    request,
    schema,
    async (data) => {
      const isFamily = data.planType === "family_access";
      const TemplateModule = isFamily
        ? await import("@/lib/email/templates/SubscriptionConfirmedFamily")
        : await import("@/lib/email/templates/SubscriptionConfirmedNurse");
      const Template = isFamily
        ? (
            TemplateModule as typeof import("@/lib/email/templates/SubscriptionConfirmedFamily")
          ).SubscriptionConfirmedFamily
        : (
            TemplateModule as typeof import("@/lib/email/templates/SubscriptionConfirmedNurse")
          ).SubscriptionConfirmedNurse;
      return {
        from: "NurseDex Team <noreply@nursedex.com>",
        to: data.to,
        replyTo: "support@nursedex.com",
        subject: isFamily
          ? "Family Access is active on NurseDex"
          : "Welcome to NurseDex Featured",
        react: Template({
          firstName: data.firstName,
          amount: data.amount,
          nextRenewalLabel: data.nextRenewalLabel,
        }),
      };
    },
    "subscription confirmed",
  );
}
